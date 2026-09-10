@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title NS Kinetic Subtitles - Universal Transcriber

echo ========================================================================
echo   NS KINETIC SUBTITLES - Universal Video/Audio Transcriber (v2.7)
echo ========================================================================
echo.

if "%~1"=="" (
    echo [TIP] Drag and drop one or multiple audio/video files onto this icon!
    echo       Supported: .mp3, .wav, .m4a, .aac, .flac, .ogg, .mp4, .mov, .mkv, .srt
    echo.
    set /p "INPUT_FILE=Or enter file path manually: "
    if "!INPUT_FILE!"=="" (
        echo No file specified. Exiting...
        pause
        exit /b 1
    )
    echo.
    node "%~dp0transcribe.js" "!INPUT_FILE!"
) else (
    echo Batch processing incoming files...
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
echo   ALL FILES SUCCESSFULLY PROCESSED!
echo ========================================================================
echo.
pause


