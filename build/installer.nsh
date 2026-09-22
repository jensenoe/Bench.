; Bench. installer look. electron-builder pulls this in through nsis.include.
; Colours follow the app: near-black pages, warm light text, the dawn accent on the period.

; electron-builder already defines MUI_HEADERIMAGE, MUI_HEADERIMAGE_RIGHT and the bitmaps, so every
; define here is guarded: a second definition of the same symbol is a hard makensis error.
!macro customHeader
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR "15161C"
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR "F3F1EC"
  !endif
  !ifndef MUI_LICENSEPAGE_BGCOLOR
    !define MUI_LICENSEPAGE_BGCOLOR "1B1C23"
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
  !ifndef MUI_FINISHPAGE_TITLE
    !define MUI_FINISHPAGE_TITLE "Ready."
  !endif
  !ifndef MUI_FINISHPAGE_TITLE_3LINES
    !define MUI_FINISHPAGE_TITLE_3LINES
  !endif
  !ifndef MUI_FINISHPAGE_TEXT
    !define MUI_FINISHPAGE_TEXT "Bench. is installed. The first start asks for your name and work email, then offers the Microsoft 365 sign-in. Both take a minute.$\r$\n$\r$\nThe gear in the top right holds everything else: the pictures, the hours workbook, the shared folder."
  !endif
  !ifndef MUI_FINISHPAGE_RUN_TEXT
    !define MUI_FINISHPAGE_RUN_TEXT "Open the bench now"
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
!macroend

!macro customInstall
  ; nothing extra: data lives in the user profile until Settings points it at a shared folder
!macroend
