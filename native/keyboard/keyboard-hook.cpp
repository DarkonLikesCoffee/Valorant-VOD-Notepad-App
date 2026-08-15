#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <iostream>
#include <string>
#include <atomic>
#include <mutex>
#include <vector>

static HHOOK g_hook = nullptr;
static std::atomic<bool> g_enabled(false);
static std::atomic<bool> g_running(true);

static DWORD g_hookThreadId = 0;

static HANDLE g_stdout = INVALID_HANDLE_VALUE;
static std::mutex g_writeMutex;

static BYTE g_keyboardState[256] = {};

struct AppHotkey
{
    UINT vk;
    bool ctrl;
    bool alt;
    bool shift;
    bool win;
};

static std::vector<AppHotkey> g_appHotkeys;
static std::mutex g_hotkeyMutex;

static void writeLine(const std::string& line)
{
    std::lock_guard<std::mutex> lock(g_writeMutex);

    if (g_stdout == INVALID_HANDLE_VALUE)
        return;

    std::string out = line + "\n";

    DWORD written = 0;
    WriteFile(
        g_stdout,
        out.data(),
        static_cast<DWORD>(out.size()),
        &written,
        nullptr
    );
}

static bool isKeyDownMessage(WPARAM msg)
{
    return msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
}

static bool isKeyUpMessage(WPARAM msg)
{
    return msg == WM_KEYUP || msg == WM_SYSKEYUP;
}

static std::string utf8FromWide(const std::wstring& value)
{
    if (value.empty())
        return "";

    int size = WideCharToMultiByte(
        CP_UTF8,
        0,
        value.data(),
        static_cast<int>(value.size()),
        nullptr,
        0,
        nullptr,
        nullptr
    );

    if (size <= 0)
        return "";

    std::string result(size, '\0');

    WideCharToMultiByte(
        CP_UTF8,
        0,
        value.data(),
        static_cast<int>(value.size()),
        result.data(),
        size,
        nullptr,
        nullptr
    );

    return result;
}

static std::string jsonEscape(const std::wstring& value)
{
    const std::string utf8 = utf8FromWide(value);

    std::string out;
    out.reserve(utf8.size() + 8);

    for (unsigned char c : utf8)
    {
        switch (c)
        {
            case '\"':
                out += "\\\"";
                break;

            case '\\':
                out += "\\\\";
                break;

            case '\b':
                out += "\\b";
                break;

            case '\f':
                out += "\\f";
                break;

            case '\n':
                out += "\\n";
                break;

            case '\r':
                out += "\\r";
                break;

            case '\t':
                out += "\\t";
                break;

            default:
                if (c < 0x20)
                {
                    char buffer[7];

                    snprintf(
                        buffer,
                        sizeof(buffer),
                        "\\u%04x",
                        c
                    );

                    out += buffer;
                }
                else
                {
                    out += static_cast<char>(c);
                }
        }
    }

    return out;
}

static std::string translateKey(
    UINT vkCode,
    UINT scanCode,
    DWORD flags
)
{
    BYTE state[256];

    memcpy(state, g_keyboardState, sizeof(state));

    HKL layout = GetKeyboardLayout(0);

    wchar_t buffer[16] = {};

    UINT scan = scanCode;

    if (flags & LLKHF_EXTENDED)
        scan |= 0xE000;

    int result = ToUnicodeEx(
        vkCode,
        scan,
        state,
        buffer,
        16,
        0,
        layout
    );

    if (result <= 0)
        return "";

    std::wstring text(buffer, result);

    return jsonEscape(text);
}

static void updateKeyboardState(
    UINT vkCode,
    bool down
)
{
    auto setKey = [&](UINT vk, bool pressed)
    {
        if (vk < 256)
        {
            if (pressed)
                g_keyboardState[vk] |= 0x80;
            else
                g_keyboardState[vk] &= 0x7F;
        }
    };

    switch (vkCode)
    {
        case VK_LSHIFT:
        case VK_RSHIFT:
        case VK_SHIFT:
            setKey(VK_SHIFT, down);
            setKey(vkCode, down);
            break;

        case VK_LCONTROL:
        case VK_RCONTROL:
        case VK_CONTROL:
            setKey(VK_CONTROL, down);
            setKey(vkCode, down);
            break;

        case VK_LMENU:
        case VK_RMENU:
        case VK_MENU:
            setKey(VK_MENU, down);
            setKey(vkCode, down);
            break;

        case VK_CAPITAL:
        case VK_NUMLOCK:
        case VK_SCROLL:
            if (down)
                g_keyboardState[vkCode] ^= 0x01;
            break;

        default:
            setKey(vkCode, down);
            break;
    }
}

static bool isAppHotkey(
    UINT vk,
    bool shift,
    bool ctrl,
    bool alt,
    bool win
)
{
    std::lock_guard<std::mutex> lock(g_hotkeyMutex);

    for (const auto& hotkey : g_appHotkeys)
    {
        if (
            hotkey.vk == vk &&
            hotkey.shift == shift &&
            hotkey.ctrl == ctrl &&
            hotkey.alt == alt &&
            hotkey.win == win
        )
        {
            return true;
        }
    }

    return false;
}

static bool isNotepadCtrlShortcut(
    UINT vk,
    bool shift,
    bool ctrl,
    bool alt,
    bool win
)
{
    if (!ctrl || alt || win)
        return false;

    switch (vk)
    {
        case 'A':
        case 'C':
        case 'V':
        case 'X':
        case 'Z':
        case 'Y':
        case 'B':
        case 'I':
            return true;

        default:
            return false;
    }
}

static LRESULT CALLBACK keyboardProc(
    int nCode,
    WPARAM wParam,
    LPARAM lParam
)
{
    if (nCode < 0)
        return CallNextHookEx(g_hook, nCode, wParam, lParam);

    if (!g_enabled.load())
        return CallNextHookEx(g_hook, nCode, wParam, lParam);

    if (!isKeyDownMessage(wParam) && !isKeyUpMessage(wParam))
        return CallNextHookEx(g_hook, nCode, wParam, lParam);

    auto* data =
        reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);

    const UINT vk = data->vkCode;
    const UINT scan = data->scanCode;
    const DWORD flags = data->flags;

    const bool down = isKeyDownMessage(wParam);

    /*
     * IMPORTANT:
     *
     * We need to know modifier state for BOTH keydown and keyup.
     *
     * On keyup, updateKeyboardState() would clear the modifier before
     * we inspect it, which previously caused Ctrl/Alt/Win key-up events
     * to be swallowed accidentally.
     */

    bool shift =
        (g_keyboardState[VK_SHIFT] & 0x80) != 0 ||
        (g_keyboardState[VK_LSHIFT] & 0x80) != 0 ||
        (g_keyboardState[VK_RSHIFT] & 0x80) != 0;

    bool ctrl =
        (g_keyboardState[VK_CONTROL] & 0x80) != 0 ||
        (g_keyboardState[VK_LCONTROL] & 0x80) != 0 ||
        (g_keyboardState[VK_RCONTROL] & 0x80) != 0;

    bool alt =
        (g_keyboardState[VK_MENU] & 0x80) != 0 ||
        (g_keyboardState[VK_LMENU] & 0x80) != 0 ||
        (g_keyboardState[VK_RMENU] & 0x80) != 0;

    bool win =
        (g_keyboardState[VK_LWIN] & 0x80) != 0 ||
        (g_keyboardState[VK_RWIN] & 0x80) != 0;

    /*
     * For keydown, include the modifier that is currently being pressed.
     */
    if (down)
    {
        if (
            vk == VK_SHIFT ||
            vk == VK_LSHIFT ||
            vk == VK_RSHIFT
        )
            shift = true;

        if (
            vk == VK_CONTROL ||
            vk == VK_LCONTROL ||
            vk == VK_RCONTROL
        )
            ctrl = true;

        if (
            vk == VK_MENU ||
            vk == VK_LMENU ||
            vk == VK_RMENU
        )
            alt = true;

        if (
            vk == VK_LWIN ||
            vk == VK_RWIN
        )
            win = true;
    }

    /*
     * First check whether this key is one of OUR application hotkeys.
     *
     * We only trigger application hotkeys on keydown.
     */
    if (down && isAppHotkey(vk, shift, ctrl, alt, win))
    {
        std::string json = "{";

        json += "\"type\":\"shortcut\",";
        json += "\"vk\":" + std::to_string(vk) + ",";
        json += "\"shift\":";
        json += shift ? "true," : "false,";
        json += "\"ctrl\":";
        json += ctrl ? "true," : "false,";
        json += "\"alt\":";
        json += alt ? "true," : "false,";
        json += "\"win\":";
        json += win ? "true" : "false";

        json += "}";

        writeLine(json);

        /*
         * This is OUR shortcut.
         * Do not let Windows/game receive it.
         */
        return 1;
    }

    /*
 * Notepad editing shortcuts.
 *
 * These are handled by the overlay's textarea rather than by
 * Windows/VALORANT.
 */
if (down && isNotepadCtrlShortcut(vk, shift, ctrl, alt, win))
{
    std::string json = "{";

    json += "\"type\":\"editor-shortcut\",";
    json += "\"vk\":" + std::to_string(vk) + ",";
    json += "\"shift\":";
    json += shift ? "true," : "false,";
    json += "\"ctrl\":";
    json += ctrl ? "true," : "false,";
    json += "\"alt\":";
    json += alt ? "true," : "false,";
    json += "\"win\":";
    json += win ? "true" : "false";

    json += "}";

    writeLine(json);

    return 1;
}

    /*
     * If Ctrl/Alt/Win is involved and it isn't one of our hotkeys,
     * completely leave the combination alone.
     *
     * This is critical:
     *
     *     Ctrl+C
     *     Ctrl+A
     *     Ctrl+V
     *     Alt+Tab
     *     Win+Tab
     *     Win+D
     *     Win+E
     *     etc.
     *
     * must reach Windows normally.
     *
     * We do this on BOTH keydown and keyup.
     */
    if (ctrl || alt || win)
    {
        return CallNextHookEx(g_hook, nCode, wParam, lParam);
    }

/*
 * Modifier keys must be tracked internally AND passed through
 * to Windows.
 *
 * This is important because the next key needs to know that
 * Ctrl/Alt/Shift/Win is currently being held.
 */
if (
    vk == VK_SHIFT ||
    vk == VK_LSHIFT ||
    vk == VK_RSHIFT ||
    vk == VK_CONTROL ||
    vk == VK_LCONTROL ||
    vk == VK_RCONTROL ||
    vk == VK_MENU ||
    vk == VK_LMENU ||
    vk == VK_RMENU ||
    vk == VK_LWIN ||
    vk == VK_RWIN
)
{
    updateKeyboardState(vk, down);

    return CallNextHookEx(g_hook, nCode, wParam, lParam);
}

    /*
 * Update our internal state for normal keys.
 *
 * Modifier keys are handled separately above because they must
 * both update our state and pass through to Windows.
 */
updateKeyboardState(vk, down);

    /*
     * Normal overlay input.
     *
     * Only keys that are NOT part of Ctrl/Alt/Win combinations reach here.
     */
    std::string text;

    if (down)
    {
        text = translateKey(vk, scan, flags);

        /*
         * These are control keys rather than printable text.
         */
        if (
            vk == VK_BACK ||
            vk == VK_DELETE ||
            vk == VK_RETURN ||
            vk == VK_TAB ||
            vk == VK_ESCAPE ||
            vk == VK_LEFT ||
            vk == VK_RIGHT ||
            vk == VK_UP ||
            vk == VK_DOWN ||
            vk == VK_HOME ||
            vk == VK_END ||
            vk == VK_PRIOR ||
            vk == VK_NEXT ||
            vk == VK_INSERT
        )
        {
            text.clear();
        }
    }

    std::string json =
        "{"
        "\"type\":\"" + std::string(down ? "keydown" : "keyup") + "\","
        "\"vk\":" + std::to_string(vk) + ","
        "\"scan\":" + std::to_string(scan) + ","
        "\"shift\":" + std::string(shift ? "true" : "false") + ","
        "\"ctrl\":" + std::string(ctrl ? "true" : "false") + ","
        "\"alt\":" + std::string(alt ? "true" : "false") + ","
        "\"win\":" + std::string(win ? "true" : "false") + ","
        "\"text\":\"" + text + "\""
        "}";

    writeLine(json);

    /*
     * Normal overlay input is consumed here so it cannot reach
     * VALORANT or the foreground application.
     */
    return 1;
}

static DWORD WINAPI hookThread(LPVOID)
{
    g_hookThreadId = GetCurrentThreadId();

    g_hook = SetWindowsHookExW(
        WH_KEYBOARD_LL,
        keyboardProc,
        GetModuleHandleW(nullptr),
        0
    );

    if (!g_hook)
    {
        writeLine("{\"error\":\"SetWindowsHookEx failed\"}");
        return 1;
    }

    writeLine("{\"ready\":true}");

    MSG msg;

    while (g_running.load())
    {
        BOOL result = GetMessageW(&msg, nullptr, 0, 0);

        if (result <= 0)
            break;

        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    UnhookWindowsHookEx(g_hook);
    g_hook = nullptr;

    return 0;
}

int main()
{
    g_stdout = GetStdHandle(STD_OUTPUT_HANDLE);

    HANDLE thread =
        CreateThread(
            nullptr,
            0,
            hookThread,
            nullptr,
            0,
            nullptr
        );

    if (!thread)
        return 1;

    std::string command;

    while (g_running.load() && std::getline(std::cin, command))
    {
        if (command.rfind("hotkeys ", 0) == 0)
{
    const std::string payload = command.substr(8);

    std::vector<AppHotkey> parsed;

    size_t pos = 0;

    while (true)
    {
        size_t objectStart = payload.find('{', pos);

        if (objectStart == std::string::npos)
            break;

        size_t objectEnd = payload.find('}', objectStart);

        if (objectEnd == std::string::npos)
            break;

        std::string object =
            payload.substr(
                objectStart,
                objectEnd - objectStart + 1
            );

        AppHotkey hotkey{};
        hotkey.vk = 0;
        hotkey.ctrl = false;
        hotkey.alt = false;
        hotkey.shift = false;
        hotkey.win = false;

        auto readBool = [&](const char* name) -> bool
        {
            std::string key = "\"";
            key += name;
            key += "\":true";

            return object.find(key) != std::string::npos;
        };

        auto readUInt = [&](const char* name) -> UINT
        {
            std::string key = "\"";
            key += name;
            key += "\":";

            size_t start = object.find(key);

            if (start == std::string::npos)
                return 0;

            start += key.size();

            size_t end = object.find_first_of(",}", start);

            if (end == std::string::npos)
                end = object.size();

            try
            {
                return static_cast<UINT>(
                    std::stoul(
                        object.substr(
                            start,
                            end - start
                        )
                    )
                );
            }
            catch (...)
            {
                return 0;
            }
        };

        hotkey.vk = readUInt("vk");
        hotkey.ctrl = readBool("ctrl");
        hotkey.alt = readBool("alt");
        hotkey.shift = readBool("shift");
        hotkey.win = readBool("win");

        if (hotkey.vk != 0)
            parsed.push_back(hotkey);

        pos = objectEnd + 1;
    }

    {
        std::lock_guard<std::mutex> lock(g_hotkeyMutex);
        g_appHotkeys = std::move(parsed);
    }

    writeLine(
        "{\"status\":\"hotkeys-updated\"}"
    );

    continue;
}
        if (command == "enable")
        {
            g_enabled.store(true);
            writeLine("{\"status\":\"enabled\"}");
        }
        else if (command == "disable")
        {
            g_enabled.store(false);

            // Clear modifier state when switching back to normal input.
            memset(g_keyboardState, 0, sizeof(g_keyboardState));

            writeLine("{\"status\":\"disabled\"}");
        }
        else if (command == "quit")
{
    g_enabled.store(false);
    g_running.store(false);

    PostThreadMessageW(
        g_hookThreadId,
        WM_QUIT,
        0,
        0
    );

    break;
}
    }

    WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread);

    return 0;
}