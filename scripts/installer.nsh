!macro NSIS_HOOK_POSTINSTALL
  ; Make md++ visible in Windows "Open with" and Default Apps.
  WriteRegStr HKCU "Software\Classes\Applications\md++.exe" "FriendlyAppName" "md++"
  WriteRegStr HKCU "Software\Classes\Applications\md++.exe\DefaultIcon" "" '"$INSTDIR\md++.exe",0'
  WriteRegStr HKCU "Software\Classes\Applications\md++.exe\shell\open\command" "" '"$INSTDIR\md++.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\md++.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\md++.exe\SupportedTypes" ".markdown" ""

  ; ProgID used by the installer and the in-app default-program command.
  WriteRegStr HKCU "Software\Classes\MdppMarkdown" "" "Markdown 文件"
  WriteRegStr HKCU "Software\Classes\MdppMarkdown" "FriendlyTypeName" "Markdown 文件"
  WriteRegStr HKCU "Software\Classes\MdppMarkdown\DefaultIcon" "" '"$INSTDIR\md++.exe",0'
  WriteRegStr HKCU "Software\Classes\MdppMarkdown\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\MdppMarkdown\shell\open" "" "用 md++ 打开"
  WriteRegStr HKCU "Software\Classes\MdppMarkdown\shell\open\command" "" '"$INSTDIR\md++.exe" "%1"'

  ; Register direct associations and Open With candidates.
  WriteRegStr HKCU "Software\Classes\.md" "" "MdppMarkdown"
  WriteRegStr HKCU "Software\Classes\.markdown" "" "MdppMarkdown"
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "MdppMarkdown" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "MdppMarkdown" ""
  WriteRegStr HKCU "Software\Classes\.md\OpenWithList\md++.exe" "" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithList\md++.exe" "" ""
  WriteRegStr HKCU "Software\Classes\.md\shell\OpenWithMdpp" "" "用 md++ 打开"
  WriteRegStr HKCU "Software\Classes\.md\shell\OpenWithMdpp\command" "" '"$INSTDIR\md++.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.markdown\shell\OpenWithMdpp" "" "用 md++ 打开"
  WriteRegStr HKCU "Software\Classes\.markdown\shell\OpenWithMdpp\command" "" '"$INSTDIR\md++.exe" "%1"'

  ; Capabilities entry shown in Windows Default Apps settings.
  WriteRegStr HKCU "Software\md++\Capabilities" "ApplicationName" "md++"
  WriteRegStr HKCU "Software\md++\Capabilities" "ApplicationDescription" "Windows 轻量便捷的 Markdown 阅读器"
  WriteRegStr HKCU "Software\md++\Capabilities\FileAssociations" ".md" "MdppMarkdown"
  WriteRegStr HKCU "Software\md++\Capabilities\FileAssociations" ".markdown" "MdppMarkdown"
  WriteRegStr HKCU "Software\RegisteredApplications" "md++" "Software\md++\Capabilities"

  ; 通知系统刷新文件关联
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
