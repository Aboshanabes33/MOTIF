/*
 * MOTIF Portable Self-Extracting Windows x64 Launcher
 *
 * - Cross-compiled for Windows x64 GUI (-mwindows -municode) using Zig + miniz.
 * - Full Unicode (UTF-16) path support so Arabic/non-ASCII Windows usernames work cleanly.
 * - Extracts the appended ZIP archive inside this .exe into %LOCALAPPDATA%\MOTIF\app-2.0.0\
 *   on first launch (cached via size stamp for instant subsequent launches).
 * - Starts bundled Node.js 24 LTS running launcher/start-motif.mjs with CREATE_NO_WINDOW.
 * - Also compiles with -DMOTIF_TEST_CLI on Linux/POSIX to verify extraction byte-for-byte.
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <stdbool.h>

#include "miniz.h"

#define MOTIF_VERSION_STR "2.0.0"
#define MOTIF_PATH_MAX 4096

static bool is_safe_zip_path(const char *rel) {
  if (!rel || rel[0] == '\0') return false;
  if (rel[0] == '/' || rel[0] == '\\') return false;
  if (strchr(rel, ':') != NULL) return false;
  const char *p = rel;
  while (*p) {
    if (p[0] == '.' && p[1] == '.' && (p[2] == '/' || p[2] == '\\' || p[2] == '\0')) {
      return false;
    }
    while (*p && *p != '/' && *p != '\\') p++;
    while (*p == '/' || *p == '\\') p++;
  }
  return true;
}

#ifdef MOTIF_TEST_CLI
#include <sys/stat.h>
#include <errno.h>

static bool mkdir_p_posix(const char *path) {
  char tmp[MOTIF_PATH_MAX];
  size_t len = strlen(path);
  if (len == 0 || len >= sizeof(tmp)) return false;
  memcpy(tmp, path, len + 1);
  for (char *p = tmp + 1; *p; p++) {
    if (*p == '/') {
      *p = '\0';
      if (mkdir(tmp, 0755) != 0 && errno != EEXIST) return false;
      *p = '/';
    }
  }
  return mkdir(tmp, 0755) == 0 || errno == EEXIST;
}

static bool extract_sfx_posix(const char *archive_path, const char *dest_dir) {
  FILE *fp = fopen(archive_path, "rb");
  if (!fp) {
    fprintf(stderr, "Cannot open archive: %s\n", archive_path);
    return false;
  }
  fseek(fp, 0, SEEK_END);
  long fsize = ftell(fp);
  fseek(fp, 0, SEEK_SET);
  if (fsize <= 0) {
    fclose(fp);
    return false;
  }

  mz_zip_archive zip;
  memset(&zip, 0, sizeof(zip));
  if (!mz_zip_reader_init_cfile(&zip, fp, (mz_uint64)fsize, 0)) {
    fprintf(stderr, "mz_zip_reader_init_cfile failed: %s\n",
            mz_zip_get_error_string(mz_zip_get_last_error(&zip)));
    fclose(fp);
    return false;
  }

  mz_uint total = mz_zip_reader_get_num_files(&zip);
  if (!mkdir_p_posix(dest_dir)) {
    mz_zip_reader_end(&zip);
    fclose(fp);
    return false;
  }

  for (mz_uint i = 0; i < total; i++) {
    mz_zip_archive_file_stat st;
    if (!mz_zip_reader_file_stat(&zip, i, &st)) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      return false;
    }
    if (!is_safe_zip_path(st.m_filename)) {
      fprintf(stderr, "Unsafe zip path rejected: %s\n", st.m_filename);
      mz_zip_reader_end(&zip);
      fclose(fp);
      return false;
    }
    char out_path[MOTIF_PATH_MAX];
    snprintf(out_path, sizeof(out_path), "%s/%s", dest_dir, st.m_filename);
    if (mz_zip_reader_is_file_a_directory(&zip, i)) {
      if (!mkdir_p_posix(out_path)) {
        mz_zip_reader_end(&zip);
        fclose(fp);
        return false;
      }
      continue;
    }
    char *slash = strrchr(out_path, '/');
    if (slash) {
      *slash = '\0';
      if (!mkdir_p_posix(out_path)) {
        mz_zip_reader_end(&zip);
        fclose(fp);
        return false;
      }
      *slash = '/';
    }
    FILE *out = fopen(out_path, "wb");
    if (!out) {
      fprintf(stderr, "Cannot write: %s\n", out_path);
      mz_zip_reader_end(&zip);
      fclose(fp);
      return false;
    }
    bool ok = mz_zip_reader_extract_to_cfile(&zip, i, out, 0) != 0;
    fclose(out);
    if (!ok) {
      fprintf(stderr, "Extract failed for %s: %s\n", st.m_filename,
              mz_zip_get_error_string(mz_zip_get_last_error(&zip)));
      mz_zip_reader_end(&zip);
      fclose(fp);
      return false;
    }
  }

  mz_zip_reader_end(&zip);
  fclose(fp);
  printf("Extracted %u entries cleanly to %s\n", total, dest_dir);
  return true;
}

int main(int argc, char **argv) {
  if (argc != 3) {
    fprintf(stderr, "Usage: %s <sfx.exe> <dest_dir>\n", argv[0]);
    return 2;
  }
  return extract_sfx_posix(argv[1], argv[2]) ? 0 : 1;
}

#else /* Windows GUI executable */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>

static void show_error_w(const wchar_t *msg) {
  MessageBoxW(NULL, msg, L"MOTIF", MB_OK | MB_ICONERROR);
}

static bool mkdir_p_win(const wchar_t *path) {
  wchar_t tmp[MOTIF_PATH_MAX];
  size_t len = wcslen(path);
  if (len == 0 || len >= MOTIF_PATH_MAX) return false;
  wmemcpy(tmp, path, len + 1);

  for (size_t i = 0; i < len; i++) {
    if (tmp[i] == L'/') tmp[i] = L'\\';
  }

  if (len > 3) {
    for (wchar_t *p = tmp + 3; *p; p++) {
      if (*p == L'\\') {
        *p = L'\0';
        if (!CreateDirectoryW(tmp, NULL)) {
          DWORD err = GetLastError();
          if (err != ERROR_ALREADY_EXISTS) return false;
        }
        *p = L'\\';
      }
    }
  }
  if (!CreateDirectoryW(tmp, NULL)) {
    DWORD err = GetLastError();
    if (err != ERROR_ALREADY_EXISTS) return false;
  }
  return true;
}

static bool utf8_to_wide(const char *src, wchar_t *dst, int dst_chars) {
  int n = MultiByteToWideChar(CP_UTF8, 0, src, -1, dst, dst_chars);
  return n > 0;
}

static bool get_file_size_w(const wchar_t *path, uint64_t *out_size) {
  WIN32_FILE_ATTRIBUTE_DATA data;
  if (!GetFileAttributesExW(path, GetFileExInfoStandard, &data)) return false;
  *out_size = (((uint64_t)data.nFileSizeHigh) << 32) | (uint64_t)data.nFileSizeLow;
  return true;
}

static bool file_exists_w(const wchar_t *path) {
  DWORD attr = GetFileAttributesW(path);
  return attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

static bool extract_sfx_win(const wchar_t *exe_path, uint64_t exe_size, const wchar_t *dest_dir) {
  FILE *fp = _wfopen(exe_path, L"rb");
  if (!fp) {
    show_error_w(L"MOTIF could not open its executable package for reading.");
    return false;
  }

  mz_zip_archive zip;
  memset(&zip, 0, sizeof(zip));
  if (!mz_zip_reader_init_cfile(&zip, fp, (mz_uint64)exe_size, 0)) {
    fclose(fp);
    show_error_w(L"MOTIF package data is corrupted or incomplete. Please re-download MOTIF.");
    return false;
  }

  if (!mkdir_p_win(dest_dir)) {
    mz_zip_reader_end(&zip);
    fclose(fp);
    show_error_w(L"MOTIF could not create its local application folder in %LOCALAPPDATA%\\MOTIF.");
    return false;
  }

  mz_uint total = mz_zip_reader_get_num_files(&zip);
  for (mz_uint i = 0; i < total; i++) {
    mz_zip_archive_file_stat st;
    if (!mz_zip_reader_file_stat(&zip, i, &st)) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      show_error_w(L"Failed to read archive entry metadata.");
      return false;
    }

    if (!is_safe_zip_path(st.m_filename)) {
      continue;
    }

    wchar_t rel_w[MOTIF_PATH_MAX];
    if (!utf8_to_wide(st.m_filename, rel_w, MOTIF_PATH_MAX)) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      show_error_w(L"Failed to decode Unicode path inside MOTIF package.");
      return false;
    }
    for (wchar_t *p = rel_w; *p; p++) {
      if (*p == L'/') *p = L'\\';
    }

    wchar_t out_path[MOTIF_PATH_MAX];
    if (_snwprintf(out_path, MOTIF_PATH_MAX, L"%ls\\%ls", dest_dir, rel_w) < 0) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      show_error_w(L"Destination path is too long.");
      return false;
    }

    if (mz_zip_reader_is_file_a_directory(&zip, i)) {
      mkdir_p_win(out_path);
      continue;
    }

    wchar_t *slash = wcsrchr(out_path, L'\\');
    if (slash) {
      *slash = L'\0';
      if (!mkdir_p_win(out_path)) {
        mz_zip_reader_end(&zip);
        fclose(fp);
        show_error_w(L"Could not create directory while unpacking MOTIF.");
        return false;
      }
      *slash = L'\\';
    }

    FILE *out = _wfopen(out_path, L"wb");
    if (!out) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      show_error_w(L"Could not write MOTIF application files. Please check disk space or close running MOTIF instances.");
      return false;
    }

    bool ok = mz_zip_reader_extract_to_cfile(&zip, i, out, 0) != 0;
    fclose(out);
    if (!ok) {
      mz_zip_reader_end(&zip);
      fclose(fp);
      show_error_w(L"Failed while extracting MOTIF runtime files.");
      return false;
    }
  }

  mz_zip_reader_end(&zip);
  fclose(fp);
  return true;
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
  (void)hInstance;
  (void)hPrevInstance;
  (void)pCmdLine;
  (void)nCmdShow;

  wchar_t exe_path[MOTIF_PATH_MAX];
  DWORD n = GetModuleFileNameW(NULL, exe_path, MOTIF_PATH_MAX);
  if (n == 0 || n >= MOTIF_PATH_MAX) {
    show_error_w(L"Could not determine MOTIF executable path.");
    return 1;
  }

  uint64_t exe_size = 0;
  if (!get_file_size_w(exe_path, &exe_size) || exe_size == 0) {
    show_error_w(L"Could not inspect MOTIF executable package.");
    return 1;
  }

  wchar_t local_app[MOTIF_PATH_MAX];
  DWORD env_len = GetEnvironmentVariableW(L"LOCALAPPDATA", local_app, MOTIF_PATH_MAX);
  if (env_len == 0 || env_len >= MOTIF_PATH_MAX) {
    env_len = GetTempPathW(MOTIF_PATH_MAX, local_app);
    if (env_len == 0 || env_len >= MOTIF_PATH_MAX) {
      show_error_w(L"Could not resolve LOCALAPPDATA folder.");
      return 1;
    }
  }

  wchar_t app_dir[MOTIF_PATH_MAX];
  _snwprintf(app_dir, MOTIF_PATH_MAX, L"%ls\\MOTIF\\app-2.0.0", local_app);

  wchar_t stamp_path[MOTIF_PATH_MAX];
  _snwprintf(stamp_path, MOTIF_PATH_MAX, L"%ls\\.ready-2.0.0-%llu", app_dir, (unsigned long long)exe_size);

  wchar_t node_exe[MOTIF_PATH_MAX];
  _snwprintf(node_exe, MOTIF_PATH_MAX, L"%ls\\runtime\\node.exe", app_dir);

  wchar_t start_script[MOTIF_PATH_MAX];
  _snwprintf(start_script, MOTIF_PATH_MAX, L"%ls\\launcher\\start-motif.mjs", app_dir);

  if (!file_exists_w(stamp_path) || !file_exists_w(node_exe) || !file_exists_w(start_script)) {
    if (!extract_sfx_win(exe_path, exe_size, app_dir)) {
      return 1;
    }
    FILE *sf = _wfopen(stamp_path, L"wb");
    if (sf) {
      fputs("ok\n", sf);
      fclose(sf);
    }
  }

  SetEnvironmentVariableW(L"MOTIF_APP_DIR", app_dir);
  SetEnvironmentVariableW(L"MOTIF_EXE_PATH", exe_path);

  wchar_t cmd_line[MOTIF_PATH_MAX * 2];
  _snwprintf(cmd_line, MOTIF_PATH_MAX * 2, L"\"%ls\" \"%ls\"", node_exe, start_script);

  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  memset(&pi, 0, sizeof(pi));
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;

  if (!CreateProcessW(
          node_exe,
          cmd_line,
          NULL,
          NULL,
          FALSE,
          CREATE_NO_WINDOW,
          NULL,
          app_dir,
          &si,
          &pi)) {
    show_error_w(L"MOTIF failed to launch its local runtime (runtime\\node.exe).");
    return 1;
  }

  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD exit_code = 0;
  GetExitCodeProcess(pi.hProcess, &exit_code);
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return (int)exit_code;
}
#endif
