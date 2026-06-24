!macro NSIS_HOOK_PREUNINSTALL
  ; 卸载时清理注册表
  DeleteRegKey HKCU "Software\Classes\.md\shell\OpenWithMdpp"
  DeleteRegKey HKCU "Software\Classes\.markdown\shell\OpenWithMdpp"
  DeleteRegKey HKCU "Software\Classes\Applications\md++.exe"
  DeleteRegKey HKCU "Software\Classes\MdppMarkdown"
  DeleteRegValue HKCU "Software\RegisteredApplications" "md++"
  DeleteRegKey HKCU "Software\md++"
  ; 只清理我们设置的默认值，不删除 .md 和 .markdown 的其他关联
  ; 通知系统刷新
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
