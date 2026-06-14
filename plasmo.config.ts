export default ({
  manifest: {
    permissions: [
      "sidePanel",
      "storage",
      "alarms",
      "tabs",
      "activeTab",
    ],
    host_permissions: [
      "http://localhost/*",
      "https://localhost/*",
      "<all_urls>"
    ],
    side_panel: {
      default_path: "sidepanel.html"
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Alt+Shift+O"
        },
        description: "Open LocalMind by Interra"
      }
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    }
  }
})
