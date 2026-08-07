import sys

with open('src/components/AdminPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "AdminSystemErrors" not in content:
    # Add import
    import_target = "import AdminEnrichedPois from './AdminEnrichedPois';"
    if import_target in content:
        content = content.replace(import_target, import_target + "\nimport AdminSystemErrors from './AdminSystemErrors';")
    else:
        # Fallback for import
        content = content.replace("import AdminEditor from './AdminEditor';", "import AdminEditor from './AdminEditor';\nimport AdminSystemErrors from './AdminSystemErrors';")

    # Add tab to state type
    state_target = "'users' | 'coupons' | 'quotas' | 'counters' | 'editor' | 'gamification' | 'health' | 'api_stats' | 'enriched_pois'"
    if state_target in content:
        content = content.replace(state_target, state_target + " | 'system_errors'")

    # Add tab button
    button_target = "onClick={() => setActiveTab('enriched_pois')}"
    # find the end of the button block for enriched_pois
    idx = content.find(button_target)
    if idx != -1:
        end_idx = content.find("</button>", idx) + 9
        new_btn = """
          <button
            onClick={() => setActiveTab('system_errors')}
            className={px-4 py-2 font-medium text-sm rounded-lg whitespace-nowrap transition-colors }
          >
            Errori Sistema
          </button>"""
        content = content[:end_idx] + new_btn + content[end_idx:]

    # Add tab component rendering
    render_target = "{activeTab === 'enriched_pois' && <AdminEnrichedPois />}"
    if render_target in content:
        content = content.replace(render_target, render_target + "\n      {activeTab === 'system_errors' && <AdminSystemErrors />}")

    with open('src/components/AdminPanel.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected AdminSystemErrors into AdminPanel")
else:
    print("Already injected")
