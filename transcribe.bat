@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Media-to-Text Universal Transcriber

echo ========================================================================
echo   MEDIA-TO-TEXT: Universal Media ^& YouTube Transcriber
echo ========================================================================
echo.

if "%~1"=="" (
    echo [TIP] Drag and drop audio/video files onto this icon, OR
    echo       paste a YouTube URL directly below.
    echo       Supported: YouTube URLs, .mp3, .wav, .m4a, .aac, .flac, .mp4, .mov, .mkv
    echo.
    set /p "INPUT_SOURCE=Enter file path OR YouTube URL: "
    if "!INPUT_SOURCE!"=="" (
        echo No input specified. Exiting...
        pause
        exit /b 1
    )
    echo.
    node "%~dp0transcribe.js" "!INPUT_SOURCE!"
) else (
    echo Batch processing incoming items...
    echo.
    for %%F in (%*) do (
        echo ------------------------------------------------------------------------
        echo Processing: %%~nxF
        echo ------------------------------------------------------------------------
        node "%~dp0transcribe.js" "%%~fF"
        echo.
    )
)

echo ========================================================================
echo   ALL ITEMS SUCCESSFULLY PROCESSED!
echo ========================================================================
echo.
pause


