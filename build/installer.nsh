; Bench. installer look and finish page. electron-builder pulls this in through nsis.include.
;
; Where things must go: electron-builder inserts the MUI pages while it includes assistedInstaller.nsh,
; and only afterwards inserts customHeader. So anything that changes a page (colours, texts, the finish
; page checkboxes) has to sit in customWelcomePage (inserted before the first page) or customFinishPage
; (inserted instead of the default finish page). customHeader is too late for all of that.
; A second !define of a symbol electron-builder also sets is a hard makensis error, hence the guards.

!macro customWelcomePage
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR "15161C"
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR "F3F1EC"
  !endif
  !ifndef MUI_LICENSEPAGE_BGCOLOR
    ; The licence box is a RichEdit whose text stays black whatever MUI_TEXTCOLOR says, so the box is paper, not night.
    !define MUI_LICENSEPAGE_BGCOLOR "F3F1EC"
  !endif
  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Bench."
  !endif
  !ifndef MUI_WELCOMEPAGE_TITLE_3LINES
    !define MUI_WELCOMEPAGE_TITLE_3LINES
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "The day was spread across five tools. This is the one place it all shows at once.$\r$\n$\r$\nThis is a beta. It installs for you only, keeps the board in a folder you choose and your hours and sign-ins in your own profile. Nothing leaves the machine except what you send to Microsoft 365 and the TomFit tools.$\r$\n$\r$\nClick Next to continue."
  !endif
  !ifndef MUI_LICENSEPAGE_TEXT_TOP
    !define MUI_LICENSEPAGE_TEXT_TOP "A short note before installing."
  !endif
  !ifndef MUI_LICENSEPAGE_TEXT_BOTTOM
    !define MUI_LICENSEPAGE_TEXT_BOTTOM "Bench. is TomFit-internal software. Click I Agree to continue."
  !endif
  !ifndef MUI_DIRECTORYPAGE_TEXT_TOP
    !define MUI_DIRECTORYPAGE_TEXT_TOP "Bench. installs into your own profile, no admin rights needed. Change the folder if you prefer another place."
  !endif
  !insertmacro MUI_PAGE_WELCOME
!macroend

; The finish page: open the bench now (electron-builder's own StartApp, reproduced because defining
; customFinishPage replaces its block), and a tick box that puts a shortcut on the desktop.
; The desktop shortcut is created here and only here (createDesktopShortcut is off in package.json),
; so unticking really means no shortcut.
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function benchDesktopShortcut
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  FunctionEnd


  !ifndef MUI_FINISHPAGE_TITLE
    !define MUI_FINISHPAGE_TITLE "Ready."
  !endif
  !ifndef MUI_FINISHPAGE_TITLE_3LINES
    !define MUI_FINISHPAGE_TITLE_3LINES
  !endif
  !ifndef MUI_FINISHPAGE_TEXT
    ; Three lines at most: the box under the title is short, and a longer text is cut off, not wrapped.
    !define MUI_FINISHPAGE_TEXT "Bench. is installed. The first start asks for your name and work email, then offers the Microsoft 365 sign-in. Everything else is behind the gear at the top right."
  !endif
  !ifndef MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN
  !endif
  !ifndef MUI_FINISHPAGE_RUN_FUNCTION
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !ifndef MUI_FINISHPAGE_RUN_TEXT
    !define MUI_FINISHPAGE_RUN_TEXT "Open the bench now"
  !endif
  ; MUI's "show readme" box, repurposed: the text is ours and the function makes the shortcut.
  !ifndef MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME ""
  !endif
  !ifndef MUI_FINISHPAGE_SHOWREADME_TEXT
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Add a shortcut to the desktop"
  !endif
  !ifndef MUI_FINISHPAGE_SHOWREADME_FUNCTION
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION benchDesktopShortcut
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW benchFinishShow
  !insertmacro MUI_PAGE_FINISH
  ; The two tick boxes are themed controls: Windows paints their labels black whatever MUI_TEXTCOLOR says,
  ; which on the night background made them invisible (roadmap 118). Defined after the page macro,
  ; since that macro declares the two variables. Take the theme off those two controls
  ; and colour them like the rest of the page.
  Function benchFinishShow
    ; the space before the comma matters: NSIS reads "$mui.FinishPage.Run," as one unknown name otherwise
    System::Call 'uxtheme::SetWindowTheme(i $mui.FinishPage.Run , w " ", w " ")'
    System::Call 'uxtheme::SetWindowTheme(i $mui.FinishPage.ShowReadme , w " ", w " ")'
    SetCtlColors $mui.FinishPage.Run F3F1EC 15161C
    SetCtlColors $mui.FinishPage.ShowReadme F3F1EC 15161C
  FunctionEnd
!macroend

!macro customInstall
  ; nothing extra: data lives in the user profile until Settings points it at a shared folder
!macroend

; The desktop shortcut is ours, so its removal is ours too.
!macro customUnInstall
  WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
!macroend
