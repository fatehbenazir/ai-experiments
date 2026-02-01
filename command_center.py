import streamlit as st
import requests
import json
from datetime import datetime, timezone
import os
from google import genai 

# --- 1. SECRETS LOADING ---
try:
    GITHUB_USERNAME = st.secrets["GITHUB_USERNAME"]
    REPO_NAME = st.secrets["REPO_NAME"]
    DEFAULT_API_KEY = st.secrets.get("GEMINI_API_KEY", "")
except Exception as e:
    st.error("🚨 CONFIGURATION ERROR: secrets.toml not found.")
    st.stop()

# --- 2. THEME DEFINITIONS ---
THEMES = {
    "🕵️ Cybersecurity Agent": "hacker/spy missions, infiltrating systems",
    "🚀 Space Commander": "Mars exploration, spaceship AI, galaxy navigation",
    "🎮 Game Developer": "creating power-ups, scoring systems, and NPC logic",
    "⚔️ Minecraft Architect": "managing blocks, inventory logic, and mob farming",
    "🦸 Superhero Sidekick": "hero gadgets, tracking villains, and secret base logic",
    "🐉 Pokemon Scientist": "tracking rare creatures, stats (HP), and inventory"
}

# --- 3. THE AI MISSION GENERATOR ---
def generate_ai_mission():
    theme_desc = THEMES[st.session_state.selected_theme]
    level = st.session_state.difficulty_level
    try:
        client = genai.Client(api_key=DEFAULT_API_KEY)
        prompt = f"""
        Generate a Python challenge for a 9-year-old.
        Theme: {theme_desc}
        Difficulty: {level}/10. 
        Return ONLY valid JSON with keys: "title", "story", "requirements" (list), "keywords" (list), "reward", "hints" (list).
        """
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        raw_text = response.text.strip().replace('```json', '').replace('```', '')
        new_m = json.loads(raw_text)
        st.session_state.current_mission = new_m
        st.session_state.hint_count = 0
    except Exception as e:
        st.error(f"AI Uplink Failed: {e}")

# --- 4. SESSION STATE ---
if "difficulty_level" not in st.session_state:
    st.session_state.difficulty_level = 1
if "selected_theme" not in st.session_state:
    st.session_state.selected_theme = list(THEMES.keys())[0]
if "current_mission" not in st.session_state:
    generate_ai_mission()
if "hint_count" not in st.session_state:
    st.session_state.hint_count = 0

# --- 5. GITHUB VALIDATION ---
def check_github(keywords=[]):
    url = f"https://api.github.com/repos/{GITHUB_USERNAME}/{REPO_NAME}/commits"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            commits = response.json()
            if not commits: return False, "Repo is empty!"
            commit_time_str = commits[0]['commit']['author']['date']
            utc_time = datetime.strptime(commit_time_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            local_commit_date = utc_time.astimezone().date()
            if local_commit_date != datetime.now().date():
                return False, f"Last push: {local_commit_date}. I need a push from TODAY!"
            detail_url = commits[0]['url']
            commit_details = requests.get(detail_url).json()
            files_content = ""
            for file in commit_details.get('files', []):
                files_content += file.get('patch', '') 
            missing = [k for k in keywords if k.lower() not in files_content.lower()]
            if missing: return False, f"⚠️ Logic Missing: {', '.join(missing)}"
            return True, "✅ MISSION ACCOMPLISHED!"
    except:
        return False, "📡 Signal Lost."
    return False, "Error."

# --- 6. UI SETUP & SIDEBAR ---
st.set_page_config(page_title="PyQuest", page_icon="🐍", layout="wide")

# IMPROVED CSS - Fixes invisible text on buttons
st.markdown(f"""
    <style>
    .stApp {{ background-color: #0e1117; color: white; }}
    
    /* Sidebar Styling */
    [data-testid="stSidebar"] {{
        background-color: #1e2530 !important;
        border-right: 1px solid #00ff41;
    }}
    [data-testid="stSidebar"] .stMarkdown, [data-testid="stSidebar"] label {{
        color: #00ff41 !important;
        font-weight: bold !important;
    }}

    /* Headers */
    h1, h2, h3 {{ color: #00ff41 !important; margin-bottom: 0px !important; }}
    
    /* UNIVERSAL BUTTON FIX: Ensuring text is ALWAYS visible and black */
    div.stButton > button {{
        background-color: #00ff41 !important;
        color: #000000 !important;
        font-weight: bold !important;
        border-radius: 8px !important;
        border: 2px solid #00ff41 !important;
        height: 3.5em !important;
        width: 100% !important;
        transition: all 0.3s ease !important;
    }}

    /* Keeps text black when hovering, clicking, or focused */
    div.stButton > button:hover, div.stButton > button:active, div.stButton > button:focus {{
        color: #000000 !important;
        background-color: #05ff00 !important;
        box-shadow: 0 0 15px #00ff41 !important;
        border: 2px solid white !important;
    }}
    </style>
    """, unsafe_allow_html=True)

# SIDEBAR
with st.sidebar:
    st.title("⚙️ SETTINGS")
    theme_choice = st.selectbox(
        "SELECT WORLD THEME:",
        options=list(THEMES.keys()),
        index=list(THEMES.keys()).index(st.session_state.selected_theme),
        key="theme_selector"
    )
    if theme_choice != st.session_state.selected_theme:
        st.session_state.selected_theme = theme_choice
        with st.spinner("Changing World..."):
            generate_ai_mission()
        st.rerun()
    st.markdown("---")
    st.write(f"👤 **AGENT:** `{GITHUB_USERNAME}`")
    st.write(f"📈 **LEVEL:** `{st.session_state.difficulty_level}`")
    st.write(f"📂 **REPO:** `{REPO_NAME}`")
    if st.button("♻️ RESET PROGRESS"):
        st.session_state.difficulty_level = 1
        generate_ai_mission()
        st.rerun()

# --- 7. MAIN INTERFACE ---
mission = st.session_state.current_mission
st.title(f"{st.session_state.selected_theme}")

with st.container(border=True):
    st.header(f"Mission: {mission.get('title', 'Loading...')}")
    st.write(f"**THE STORY:** {mission.get('story')}")
    st.markdown("---")
    col_a, col_b = st.columns([2, 1])
    with col_a:
        st.subheader("Technical Requirements:")
        for req in mission.get('requirements', []):
            st.write(f"✅ {req}")
    with col_b:
        st.subheader("Difficulty:")
        st.write(f"Current Level: {st.session_state.difficulty_level} / 10")

st.write("") 

# --- 8. ACTIONS ---
c1, c2, c3 = st.columns(3)
with c1:
    if st.button("📡 SCAN FOR COMMITS"):
        success, msg = check_github(mission.get('keywords', []))
        if success:
            st.balloons()
            st.success(msg)
            st.markdown(f"### 🎁 REWARD: {mission.get('reward')}")
            st.session_state.difficulty_level += 1
        else:
            st.error(msg)
with c2:
    if st.button("💡 REQUEST HINT"):
        hints = mission.get('hints', [])
        st.session_state.hint_count = min(len(hints), st.session_state.hint_count + 1)
with c3:
    if st.button("⏭️ NEXT MISSION"):
        with st.spinner("Generating..."):
            generate_ai_mission()
            st.rerun()

# Display Hints
for i in range(st.session_state.hint_count):
    hints = mission.get('hints', [])
    st.info(f"**HINT {i+1}:** {hints[i]}")
