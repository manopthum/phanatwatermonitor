# -*- coding: utf-8 -*-
"""ระบบดึงข้อมูลสำรอง (รันบน GitHub Actions)

ทำงานเฉพาะเมื่อเซิร์ฟเวอร์ที่บ้านหยุดส่งข้อมูลเกิน STALE_H ชั่วโมง
ใช้ฟังก์ชันเดียวกับ server.py (เซิร์ฟเวอร์ที่บ้านส่ง server.py ขึ้น repo นี้เอง)
ไม่ใช้คีย์ใด ๆ: ดึงเฉพาะ ThaiWater, Open-Meteo และภาพดาวเทียม NASA GIBS
(GISTDA / WeatherNext / LINE / Web Push ยังทำงานเฉพาะที่เซิร์ฟเวอร์บ้าน)
"""
import json, os, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
STALE_H = float(os.environ.get("STALE_H", "2"))
FORCE = os.environ.get("FORCE", "") in ("1", "true", "True")


EVERY_H = float(os.environ.get("EVERY_H", "0.9"))   # ตอนระบบสำรองทำงานแทน ดึงใหม่ทุก ~1 ชม.


def age_h():
    """คืน (อายุข้อมูล ชม., มาจากระบบสำรองหรือไม่)"""
    try:
        with open(os.path.join(ROOT, "data", "latest.json"), encoding="utf-8") as fh:
            d = json.load(fh)
        a = (datetime.now(timezone.utc) - datetime.fromisoformat(d["u"].replace("Z", "+00:00"))).total_seconds() / 3600
        return a, d.get("via") == "backup"
    except Exception:
        return 1e9, False


def main():
    a, by_backup = age_h()
    need = EVERY_H if by_backup else STALE_H
    if a < need and not FORCE:
        who = "ระบบสำรองเพิ่งดึงไป" if by_backup else "เซิร์ฟเวอร์ที่บ้านยังทำงาน"
        print(f"{who} (ข้อมูลอายุ {a:.1f} ชม.) — ไม่ต้องทำอะไร")
        return 0
    print(f"ข้อมูลอายุ {a:.1f} ชม. → ดึงข้อมูลสำรอง")
    import server as S
    S.log = lambda *x: print(datetime.now(S.BKK).strftime("[%H:%M:%S]"), *x, flush=True)
    try:
        S.update_sat()
    except Exception as e:
        print("ภาพดาวเทียมผิดพลาด:", repr(e))
    out = S.build()
    if {"res_l", "res_m", "wl"} <= set(out.get("stale") or {}):
        print("ThaiWater ล่มทั้งหมด ไม่มีข้อมูลใหม่ — ไม่บันทึก (กันไม่ให้ข้อมูลเก่าดูเหมือนใหม่)")
        return 0
    out["via"] = "backup"   # บอกว่ารอบนี้มาจากระบบสำรอง
    S.write_json("latest.json", out)
    hist = [h for h in S.read_json("history.json", []) if isinstance(h, dict)]
    h = dict(out["hist"], id=out["id"], via="backup")
    hist = [x for x in hist if x.get("id") != h["id"]] + [h]
    hist.sort(key=lambda x: x.get("t", ""))
    S.write_json("history.json", hist[-S.HIST_KEEP:])
    print("สำเร็จ", out["id"], "| อ่าง", len(out["res"]), "| สถานีน้ำ", len(out["wl"]), "| สถานีฝน", len(out["rn"]),
          "| ใช้ค่าเดิม:", ",".join(out.get("stale", {})) or "-")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as fh:
        fh.write("changed=1\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
