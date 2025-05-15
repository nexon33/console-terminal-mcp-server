export const EXIT_CODES = {
  SUCCESS: 0,
  TIMEOUT: -1,
  MANUAL_TERMINATION: -2,
  GENERAL_ERROR: 1, // Example, adjust as needed
  PTY_SPAWN_ERROR: 2 // Example for createTerminalProcess error
};

export const TERMINAL_MARKERS = {
  EXIT_CODE: '__EXITCODE_MARK__',
  EXIT_MARK_PS: '__exitmark' // PowerShell specific
};

export const SHELL_COMMANDS = {
  WIN32_CLEAR: 'clear\r',
  WIN32_EXIT_MARK_FUNCTION: "function __exitmark { $code = if ($LASTEXITCODE -ne $null) { Write-Host \"DEBUG: LASTEXITCODE=$LASTEXITCODE\" -ForegroundColor Yellow; $LASTEXITCODE } elseif ($?) { Write-Host \"DEBUG: Command succeeded ($$=true), using code 0\" -ForegroundColor Yellow; 0 } else { Write-Host \"DEBUG: Command failed ($$=false), using code 1\" -ForegroundColor Yellow; 1 }; Write-Host \"__EXITCODE_MARK__:$code\" }\r",
  WIN32_EMIT_EXIT_MARK: '__exitmark\r',
  UNIX_CLEAR: 'clear\r', // Or cls for cmd, clear for bash/zsh
  UNIX_EMIT_EXIT_CODE: "echo __EXITCODE_MARK__:$?\r",
  UNIX_EMIT_EXIT_CODE_INVISIBLE: "echo -e \"\\e[49m\\e[39m__EXITCODE_MARK__:$?\\e[0m\"\r"
};

export const DEFAULT_SHELL = {
  WIN32: 'powershell.exe',
  LINUX: 'bash',
  DARWIN: 'bash' // or zsh depending on newer macOS versions
};

export const DEFAULT_SHELL_ARGS = {
  POWERSHELL: ['-NoLogo', '-NoProfile'],
  BASH: []
}; 