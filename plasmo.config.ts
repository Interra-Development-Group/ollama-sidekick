export default ({
  manifest: {
    permissions: [
      "sidePanel",
      "storage",
      "alarms",
      "tabs",
      "activeTab",
      "scripting"
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
        description: "Open Ollama Sidekick"
      }
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    }
  }
})
