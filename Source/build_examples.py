"""Build the offline example catalog; original prose/media live in Source/Examples."""
from pathlib import Path
import base64
import json


def examples(root: Path):
    def text(value, size=None, color=None, span=12, kind="text", **extra):
        block = {"type": kind, "text": value, **extra}
        if size or color:
            block["textStyle"] = {**({"fontSize": size} if size else {}), **({"color": color} if color else {})}
        if span != 12:
            block["layout"] = {"span": span, **block.get("layout", {})}
        return block

    def heading(value, level=2, **extra):
        return text(value, kind="heading", level=level, **extra)

    locales = {}
    for lang in ["zh", "en"]:
        zh = lang == "zh"
        tr = lambda a, b: a if zh else b
        def run(value, size, color):
            return f'<span data-rt-size="{size}" data-rt-color="{color}">{value}</span>'

        def panel(value, span, fill, ink, size=14, padding=22, **layout):
            return text(value, size, ink, span, surface={"background": fill, "radius": 10}, layout={"span": span, "padding": padding, "lineHeight": 1.65, **layout})

        studio = [
            text(tr("晨间编辑室   /   生活与创作   /   第 01 期", "THE MORNING EDIT   /   LIFE & CREATIVE WORK   /   VOL. 01"), 11, "#b85e40", layout={"after": 8}),
            text(run(tr("给灵感，\n留一个座位。", "A place\nfor good ideas."), 40, "#203e37") + "\n\n" + tr("窗边的光、一杯刚好的咖啡。\n让一页笔记，成为认真生活的起点。", "Window light. Coffee at the right temperature.\nA small ritual for a more considered day.") + "\n\n" + run(tr("文 / 林间     约 3 分钟阅读", "BY LIN　Read in 3 minutes"), 10, "#8a7365"), 15, "#64716a", 5, layout={"span": 5, "padding": 8, "lineHeight": 1.45}),
            {"type": "image", "media": "studio", "name": tr("01 / 窗边的工作角", "01 / A desk by the window"), "width": 100, "layout": {"span": 7}},
            {"type": "divider"},
            heading(tr("把普通的一天，过成自己的节奏", "Make an ordinary day your own"), 2, size=24, color="#203e37", layout={"before": 8}),
            text(tr("不急着打开所有窗口。先用十分钟，把今天真正想做的事写下来：一个需要完成的决定、一段值得记住的对话，或只是一个还没有答案的问题。\n\n笔记不需要替你记住整个世界。它只需要在你回来时，让思路有处可续。", "Before opening every window, take ten minutes to name what matters today: a decision to make, a conversation to remember, a question still without an answer.\n\nA note does not need to hold the whole world. It needs to give your thoughts somewhere to continue."), 15, "#43544d", 8, layout={"span": 8, "lineHeight": 1.9}),
            panel(run(tr("今日的一句话", "A THOUGHT TO KEEP"), 10, "#d9cbb9") + "\n\n" + tr("**留白不是空着，\n而是为重要的事\n留下位置。**", "**Space is an invitation\nto the things\nthat matter.**"), 4, "#24473e", "#fff7e8", 19, 24),
            heading(tr("三个小练习", "Three small practices"), 2, size=23, color="#203e37", layout={"before": 18}),
            panel(run("01", 30, "#b85e40") + "  **" + tr("观察", "NOTICE") + "**\n" + tr("选一个细节认真看：叶子的影子、书页的折痕、杯沿的温度。", "Notice a detail: the shadow of a leaf, a folded page, the warmth of a cup."), 4, "#f7eee3", "#594b3d"),
            panel(run("02", 30, "#507461") + "  **" + tr("整理", "ARRANGE") + "**\n" + tr("删去一句重复的话，让一张图片和一段文字彼此照应。", "Remove one repeated sentence. Let one image and one paragraph belong together."), 4, "#eaf0e7", "#365145"),
            panel(run("03", 30, "#876952") + "  **" + tr("继续", "CONTINUE") + "**\n" + tr("给明天留一个容易开始的动作，今天就停在这里。", "Leave one small action for tomorrow. Let that be enough for today."), 4, "#f1ede6", "#594b3d"),
            {"type": "divider"},
            heading(tr("留给明天", "A note for tomorrow"), 3, size=20, color="#203e37"),
            {"type": "check", "text": tr("记下今天最值得保留的细节", "Keep the most memorable detail of the day"), "checked": True, "layout": {"span": 6}},
            {"type": "check", "text": tr("给未完成的想法留一句提示", "Leave a prompt for an unfinished thought"), "checked": False, "layout": {"span": 6}},
            text(tr("关于本页：原创虚构文章与 AI 配图。点击“编辑”，即可修改文字、配色、分栏与留白；导出 PDF 可保留排版。", "About this page: original fictional prose and an AI-generated image. Edit the text, colors, columns and spacing; export to PDF to keep the layout."), 11, "#80786e", layout={"before": 16}),
        ]
        travel = [
            text(tr("湖山来信   /   影像旅行手记   /   第 02 期", "LETTERS FROM THE LAKE   /   A VISUAL JOURNAL   /   VOL. 02"), 11, "#386f83"),
            heading(tr("山与湖之间，慢下来。", "Between mountain and water."), 1, size=38, color="#173e50", layout={"after": 4}),
            panel(run("06:10", 28, "#173e50") + "\n" + tr("第一束晨光", "FIRST LIGHT"), 4, "#eaf2f4", "#426774", padding=16),
            panel(run(tr("两天一夜", "48 HOURS"), 28, "#173e50") + "\n" + tr("不赶路的旅程", "AN UNHURRIED ESCAPE"), 4, "#eaf2f4", "#426774", padding=16),
            panel(run(tr("离线收藏", "OFFLINE"), 28, "#ab7237") + "\n" + tr("照片、文字与短片", "PICTURES, NOTES & MOTION"), 4, "#fbf1df", "#806445", padding=16),
            {"type": "image", "media": "alpine", "name": tr("远山把轮廓，交给清晨的湖面。", "The mountains leave their outline on the morning water."), "width": 100, "layout": {"span": 8, "before": 8}},
            text(run(tr("湖畔观察", "FIELD NOTES"), 10, "#a87542") + "\n\n" + tr("**抵达之前**\n\n天色从灰蓝转暖，木屋还藏在树林里。沿湖走一小段，停下来听水。\n\n不急着记录所有风景。先认真看过，再留下一句自己的话。", "**Before the light arrives**\n\nGrey blue turns warm. A cabin rests among the trees. Walk a little way along the shore, then stop to listen.\n\nDo not try to record every view. Look carefully, then keep a sentence of your own."), 15, "#345564", 4, layout={"span": 4, "padding": 16, "before": 8, "lineHeight": 1.8}),
            {"type": "divider"},
            heading(tr("把风景留在六秒里", "Six seconds to stay a little longer"), 2, size=25, color="#173e50", layout={"before": 8}),
            {"type": "video", "media": "motion", "posterMedia": "alpine", "name": tr("湖畔运镜 / 6 秒 / 原创图片动画", "Lake motion study / 6 seconds / Original still-image animation"), "width": 100, "layout": {"span": 7}},
            panel(run(tr("一段缓慢的镜头", "A SLOWER WAY TO SEE"), 10, "#b9d1d4") + "\n\n" + tr("**给旅程留一点空白。**\n\n短片保存在本机，点击才播放。\n画面慢下来，思绪也有了停留的地方。", "**Leave a little of the journey unplanned.**\n\nThe clip stays on your device and plays only when clicked. A slower image gives your thoughts somewhere to rest."), 5, "#1c4655", "#f3f5eb", 17, 24),
            heading(tr("一页行程，留一半给偶遇", "A loose plan, with room for discovery"), 2, size=24, color="#173e50", layout={"before": 16}),
            {"type": "table", "rows": [tr(["时段", "安排", "随手记"], ["When", "The plan", "What to keep"]), tr(["清晨 06:10", "沿湖步行，等光线抵达", "一张照片、一段短片"], ["Dawn at 06:10", "Walk the shore and wait for the light", "One photograph, one short clip"]), tr(["上午 10:00", "在木屋整理今天的观察", "一页双栏手记"], ["Morning at 10:00", "Collect the morning's observations", "One page of field notes"]), tr(["午后 15:00", "留出没有计划的时间", "一件计划之外的小事"], ["Afternoon at 15:00", "Leave the afternoon open", "One unplanned discovery"])]},
            {"type": "check", "text": tr("离线保存行程与笔记", "Keep the itinerary and notes offline"), "checked": True, "layout": {"span": 6}},
            {"type": "check", "text": tr("给每一张照片留一句说明", "Give each photograph a caption"), "checked": False, "layout": {"span": 6}},
            text(tr("素材说明：地点与行程为虚构；图片由 AI 生成，视频为同一图片的六秒运镜动画，并非实拍。媒体离线提供，不自动播放；PDF 显示视频封面。", "Media note: fictional scenery and itinerary. AI-generated image; the six-second clip animates that still and is not filmed footage. Offline media never autoplays; PDFs show the video poster."), 11, "#7c8586", layout={"before": 16}),
        ]
        locales[lang] = [
            {"key": "studio", "edition": 2, "name": tr("晨间编辑室：给灵感一个座位", "The Morning Edit: A Place for Ideas"), "summary": tr("大图、旁注、三栏与留白，一页安静的生活札记。", "A quiet journal with a large image, pull quote, three columns and breathing room."), "cover": "studio", "blocks": studio},
            {"key": "travel", "edition": 2, "name": tr("湖山来信：影像旅行手记", "Letters from the Lake: A Visual Journal"), "summary": tr("全幅风景、双栏笔记、离线视频与行程表。", "Panoramic scenery, two-column notes, offline video and a small itinerary."), "cover": "alpine", "blocks": travel},
            {"key": "markdown", "edition": 2, "name": tr("项目工作台：Markdown 实践", "Project Desk: Made with Markdown"), "summary": tr("从 MD 原文实际转换：标题、层级列表、待办、表格与代码。", "Converted from MD source: headings, nested lists, tasks, tables and code."), "format": "markdown", "theme": {"accent": "#275b92", "tint": "#edf3fa", "ink": "#213e62", "cover": "#213e62", "coverText": "#f4f8ff"}, "source": (root / lang / "markdown.md").read_text(encoding="utf-8")},
            {"key": "html", "edition": 2, "name": tr("留白工作室：HTML 品牌提案", "Still Studio: An HTML Brand Proposal"), "summary": tr("从 HTML 原文实际转换：配色、字号、引用和提案表格。", "Converted from HTML source: color, typography, quotations and a proposal table."), "format": "html", "theme": {"accent": "#a6533c", "tint": "#f7eee5", "ink": "#594737", "cover": "#e9e0d0", "coverText": "#34483d"}, "source": (root / lang / "proposal.html").read_text(encoding="utf-8")},
        ]
    media = {}
    for key, filename, mime in [("studio", "studio-morning.png", "image/png"), ("alpine", "alpine-dawn.png", "image/png"), ("motion", "alpine-motion.mp4", "video/mp4")]:
        media[key] = "data:" + mime + ";base64," + base64.b64encode((root / "Media" / filename).read_bytes()).decode("ascii")
    return {"media": media, "locales": locales}


def build_examples(source: Path):
    return "const exampleBundle=" + json.dumps(examples(source / "Examples"), ensure_ascii=False, separators=(",", ":")) + ";\n"
