# -*- coding: utf-8 -*-
"""把复刻策划包里的 5 个内容 JSON 压成一份前端可用的 data.js（不引入任何原版素材）。"""
import json, os, io

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_src")
DATA = os.path.join(SRC, "data")

def load(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)

strings = {}
for e in load("localization_V1.0_20261121.json")["entries"]:
    strings[e["key"]] = e["zh_CN"]

maps = []
for m in load("maps_V1.0_20261121.json")["maps"]:
    maps.append({
        "id": m["id"], "nameKey": m["name_key"], "kind": m["kind"],
        "region": m["region_id"], "quest": m.get("quest_id") or "",
        "exits": m["exits"], "seed": m.get("fixed_seed", 1),
        "spawns": [{
            "id": s["spawn_id"], "enemy": s["enemy_id"], "count": s["count"],
            "level": s["level"], "minLevel": s["min_level"], "maxLevel": s["max_level"],
            "x": s["positions"][0]["x"], "y": s["positions"][0]["y"],
            "boss": bool(s.get("boss")), "respawn": bool(s.get("respawn")),
            "quest": s.get("quest_id") or ""
        } for s in m.get("spawns", [])],
        "inter": [{
            "id": i["target_id"], "kind": i["kind"],
            "x": i["position"]["x"], "y": i["position"]["y"],
            "item": i.get("required_item_id") or "",
            "npc": i.get("npc_id") or "",
            "flag": i.get("once_flag") or ""
        } for i in m.get("interactables", [])]
    })

quests = []
for q in load("quests_V1.0_20261121.json")["quests"]:
    quests.append({
        "id": q["id"], "title": q["title_key"], "desc": q["description_key"],
        "map": q["map_id"], "seq": q["sequence"], "region": q["region_id"],
        "prereq": q.get("prerequisite_quest_ids", []),
        "mode": q["completion_mode"], "turnIn": q.get("turn_in_npc_id") or "",
        "startOnNew": bool(q.get("start_on_new_game")),
        "objectives": [{
            "id": o["objective_id"], "type": o["type"], "target": o["target_id"],
            "count": o["target_count"], "map": o.get("map_id") or "",
            "spawns": o.get("spawn_ids") or []
        } for o in q["objectives"]],
        "rewards": {"xp": q["rewards"]["xp"], "coins": q["rewards"]["coins"],
                    "items": q["rewards"].get("items", [])}
    })

enemies = {}
for e in load("enemies_V1.0_20261121.json")["enemies"]:
    ab = []
    for a in e.get("abilities", []):
        eff = a["effects"][0]
        ab.append({"delivery": a["delivery"], "cd": a["cooldown_ms"],
                   "range": a.get("range", 60), "cast": a.get("cast_time_ms", 300),
                   "power": eff.get("base_power", 0),
                   "coef": eff.get("power_coefficient", 1.0),
                   "type": eff.get("damage_type", "physical")})
    enemies[e["id"]] = {
        "name": e["name_key"], "kind": e["kind"], "level": e["level"],
        "hp": e["stats"]["max_health"], "atk": e["stats"]["attack"],
        "def": e["stats"]["defense"], "speed": e["stats"]["move_speed"],
        "aggro": e["ai"]["aggro_range"], "leash": e["ai"]["leash_range"],
        "range": e["ai"]["attack_range"], "patrol": e["ai"].get("patrol_radius", 100),
        "xp": e["xp_reward"],
        "coins": [e["loot"]["coins_min"], e["loot"]["coins_max"]],
        "drops": [{"item": d["item_id"], "chance": d["chance"],
                   "min": d["min_count"], "max": d["max_count"]}
                  for d in e["loot"].get("drops", [])],
        "ab": ab
    }

items = {}
for it in load("items_V1.0_20261121.json")["items"]:
    rec = {"name": it["name_key"], "desc": it.get("description_key", ""),
           "type": it["type"], "sub": it.get("subtype", ""),
           "price": it.get("base_price", 0), "stack": it.get("max_stack", 1),
           "sellable": it.get("sellable", True),
           "quest": bool(it.get("quest_item"))}
    if it.get("use_effects"):
        rec["use"] = it["use_effects"]
    if it.get("equipment"):
        eq = it["equipment"]
        rec["equip"] = {"slot": eq["slot"], "req": eq["required_level"],
                        "mods": eq["modifiers"], "maxUp": eq.get("max_upgrade_level", 5),
                        "rec": eq.get("upgrade_recipe_id", "")}
    if it.get("recipe"):
        r = it["recipe"]
        rec["recipe"] = {"mode": r["mode"], "target": r.get("target_item_id", ""),
                         "ing": r["ingredients"], "coins": r["coin_cost"],
                         "out": r.get("output")}
    items[it["id"]] = rec

skills = {}
for s in load("skills_V1.0_20261121.json")["skills"]:
    skills[s["id"]] = {
        "name": s["name_key"], "desc": s["description_key"],
        "delivery": s["delivery"], "targeting": s["targeting"],
        "levels": [{"lv": l["level"], "req": l["required_player_level"],
                    "cost": l["resource_cost"], "cd": l["cooldown_ms"],
                    "cast": l.get("cast_time_ms", 0), "range": l.get("range", 0),
                    "shape": l.get("shape"), "effects": l["effects"],
                    "maxTargets": l.get("max_targets", 1),
                    "speed": l.get("projectile_speed", 600)} for l in s["levels"]]
    }

shops = {}
for s in load("shops_V1.0_20261121.json")["shops"]:
    shops[s["id"]] = {"name": s["name_key"], "npc": s["npc_id"], "entries": s["entries"]}

npcs = {}
for n in load("npcs_V1.0_20261121.json")["npcs"]:
    npcs[n["id"]] = {"name": n["name_key"], "map": n["map_id"],
                     "x": n["position"]["x"], "y": n["position"]["y"],
                     "dlg": n.get("dialogue_id", ""), "shop": n.get("shop_id", ""),
                     "quests": n.get("quest_ids", []),
                     "rescue": bool(n.get("rescue_target"))}

payload = {"strings": strings, "maps": maps, "quests": quests, "enemies": enemies,
           "items": items, "skills": skills, "shops": shops, "npcs": npcs}

out = os.path.join(os.path.dirname(__file__), "..", "js", "data.js")
with io.open(out, "w", encoding="utf-8") as f:
    f.write(u"/* 内容数据由 tools/gen_data.py 从复刻策划包生成，勿手改 */\n")
    f.write(u"window.S = " + json.dumps(strings, ensure_ascii=False, separators=(",", ":")) + u";\n")
    for k, v in payload.items():
        if k == "strings":
            continue
        f.write(u"window.DATA = window.DATA || {};\n")
        f.write(u"window.DATA.%s = " % k + json.dumps(v, ensure_ascii=False, separators=(",", ":")) + u";\n")
print("ok", out, os.path.getsize(out))
