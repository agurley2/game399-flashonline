extends Control

const COLOR_TEXT := Color(0.8745, 0.9725, 1.0, 1.0)
const COLOR_TEXT_DIM := Color(0.8745, 0.9725, 1.0, 0.62)
const COLOR_CYAN := Color(0.3686, 0.9059, 1.0, 1.0)
const COLOR_WARN := Color(0.9882, 0.8, 0.3373, 1.0)
const COLOR_LOCK := Color(0.0, 1.0, 0.7059, 1.0)
const COLOR_HUB_PANEL := Color(0.0353, 0.102, 0.1843, 0.86)
const COLOR_HUB_EDGE := Color(0.3686, 0.9059, 1.0, 0.36)
const COLOR_FIELD_PANEL := Color(0.0157, 0.0706, 0.1098, 0.9)
const COLOR_FIELD_EDGE := Color(0.0, 1.0, 0.7843, 0.28)
const COLOR_HP := Color(0.149, 0.8706, 0.5373, 1.0)
const COLOR_TECH := Color(0.2902, 0.6196, 1.0, 1.0)
const COLOR_PROGRESS := Color(0.5216, 0.451, 0.9216, 1.0)
const COLOR_SLOT_BG := Color(0.0, 0.1569, 0.2235, 0.42)
const COLOR_SLOT_CD := Color(1.0, 0.7765, 0.349, 1.0)

var _anim_t := 0.0
var _mission_active := false
var _lock_on := false

var _zone_panels: Array[PanelContainer] = []
var _slot_panels: Array[PanelContainer] = []
var _reticle_parts: Array[ColorRect] = []

var _brand_ep: Label
var _brand_title: Label
var _mission_zone: Label
var _mission_objective: Label
var _radar_label: Label
var _radar_sub: Label
var _radar_phase: Label
var _radar_ring: Label
var _radar_sweep: ColorRect
var _radar_blip: ColorRect

var _job_label: Label
var _level_label: Label
var _warn_label: Label
var _status_mode: Label
var _hp_bar: ProgressBar
var _hp_value: Label
var _tech_bar: ProgressBar
var _tech_value: Label
var _mission_bar: ProgressBar
var _mission_value: Label

var _prompt_panel: PanelContainer
var _prompt_label: Label
var _wave_panel: PanelContainer
var _wave_label: Label

var _normal_cd: Label
var _normal_hint: Label
var _heavy_cd: Label
var _heavy_hint: Label
var _tech_cd: Label
var _tech_hint: Label
var _palette_meta: Label

func _ready() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	offset_left = 0.0
	offset_top = 0.0
	offset_right = 0.0
	offset_bottom = 0.0
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build_ui()
	_make_click_through(self)
	_apply_zone_style(false)

func _process(delta: float) -> void:
	_anim_t += delta
	if _radar_sweep:
		_radar_sweep.rotation = _anim_t * 0.7
	if _radar_blip:
		var pulse := 0.72 + 0.28 * (0.5 + 0.5 * sin(_anim_t * 3.8))
		_radar_blip.modulate = Color(COLOR_WARN.r, COLOR_WARN.g, COLOR_WARN.b, pulse)
	if not _reticle_parts.is_empty():
		var alpha := 0.35
		var pulse_scale := 1.0
		var color := COLOR_CYAN
		if _lock_on:
			alpha = 0.95
			pulse_scale = 1.0 + 0.04 * sin(_anim_t * 7.5)
			color = COLOR_LOCK
		for part in _reticle_parts:
			part.color = Color(color.r, color.g, color.b, alpha)
			part.scale = Vector2.ONE * pulse_scale

func update_view(data: Dictionary) -> void:
	_mission_active = bool(data.get("mission_active", false))
	_lock_on = bool(data.get("lock_on", false))
	_apply_zone_style(_mission_active)

	_brand_ep.text = str(data.get("brand_ep", "EPISODE I"))
	_brand_title.text = str(data.get("brand_title", "FLASH ONLINE"))
	_mission_zone.text = str(data.get("title", "Pioneer 2"))
	_mission_objective.text = str(data.get("objective", "Board the telepipe again for another Forest 1 run."))
	_radar_label.text = str(data.get("map_label", "PIONEER 2"))

	var radar_sub := "TARGET LOCK" if _lock_on else "MANUAL AIM"
	var mission_clock := str(data.get("mission_clock", ""))
	if mission_clock != "":
		radar_sub += "  ·  " + mission_clock
	_radar_sub.text = radar_sub

	var phase_label := str(data.get("phase_label", "LOBBY"))
	var target_name := str(data.get("target_name", ""))
	_radar_phase.text = phase_label if target_name == "" else "%s  ·  %s" % [phase_label, target_name]
	_radar_ring.text = "◎" if _mission_active else "◉"

	_job_label.text = str(data.get("job", "HUmar"))
	_level_label.text = "LV %d" % int(data.get("level", 1))

	var hurt := bool(data.get("hurt", false))
	_warn_label.visible = hurt
	_warn_label.text = "DAMAGE" if hurt else ""

	_status_mode.text = str(data.get("status_mode", "TARGET LOCK" if _lock_on else "MANUAL AIM"))

	var hp := int(data.get("hp", 0))
	var max_hp := maxi(1, int(data.get("max_hp", 100)))
	_hp_bar.value = 100.0 * clampf(float(hp) / float(max_hp), 0.0, 1.0)
	_hp_value.text = "%d / %d" % [hp, max_hp]

	var tech_pct := clampf(float(data.get("tech_pct", 1.0)), 0.0, 1.0)
	_tech_bar.value = tech_pct * 100.0
	_tech_value.text = str(data.get("tech_text", "READY"))

	var mission_pct := clampf(float(data.get("mission_pct", 0.0)), 0.0, 1.0)
	_mission_bar.value = mission_pct * 100.0
	_mission_value.text = str(data.get("mission_text", "STANDBY"))

	var prompt := str(data.get("prompt", ""))
	_prompt_panel.visible = prompt != ""
	_prompt_label.text = prompt

	var wave_text := str(data.get("wave_text", "HUNTERS GUILD - TELEPIPE READY"))
	_wave_label.text = wave_text

	_update_slot(_normal_cd, _normal_hint, float(data.get("cd_normal", 0.0)), "Combo")
	_update_slot(_heavy_cd, _heavy_hint, float(data.get("cd_heavy", 0.0)), "Slash")
	_update_slot(_tech_cd, _tech_hint, float(data.get("cd_tech", 0.0)), "Cast")

	_palette_meta.text = str(data.get("palette_meta", "E TO LOCK · RMB CAM"))

func _update_slot(cd_label: Label, hint_label: Label, cooldown: float, hint: String) -> void:
	var on_cd := cooldown > 0.05
	cd_label.visible = on_cd
	hint_label.visible = not on_cd
	if on_cd:
		cd_label.text = "%.1f" % cooldown
	else:
		hint_label.text = hint

func _build_ui() -> void:
	_build_reticle()
	_build_top_bar()
	_build_status_panel()
	_build_prompt_stack()
	_build_palette()

func _make_click_through(root: Node) -> void:
	if root is Control:
		(root as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in root.get_children():
		_make_click_through(child)

func _build_reticle() -> void:
	var reticle := Control.new()
	reticle.name = "Reticle"
	reticle.anchor_left = 0.5
	reticle.anchor_top = 0.5
	reticle.anchor_right = 0.5
	reticle.anchor_bottom = 0.5
	reticle.offset_left = -60.0
	reticle.offset_top = -60.0
	reticle.offset_right = 60.0
	reticle.offset_bottom = 60.0
	add_child(reticle)

	_add_corner(reticle, Vector2(10.0, 10.0), Vector2(18.0, 2.0))
	_add_corner(reticle, Vector2(10.0, 10.0), Vector2(2.0, 18.0))
	_add_corner(reticle, Vector2(92.0, 10.0), Vector2(18.0, 2.0))
	_add_corner(reticle, Vector2(108.0, 10.0), Vector2(2.0, 18.0))
	_add_corner(reticle, Vector2(10.0, 108.0), Vector2(18.0, 2.0))
	_add_corner(reticle, Vector2(10.0, 92.0), Vector2(2.0, 18.0))
	_add_corner(reticle, Vector2(92.0, 108.0), Vector2(18.0, 2.0))
	_add_corner(reticle, Vector2(108.0, 92.0), Vector2(2.0, 18.0))

func _add_corner(parent: Control, pos: Vector2, size: Vector2) -> void:
	var part := ColorRect.new()
	part.position = pos
	part.size = size
	parent.add_child(part)
	_reticle_parts.append(part)

func _build_top_bar() -> void:
	var top_row := HBoxContainer.new()
	top_row.anchor_left = 0.0
	top_row.anchor_top = 0.0
	top_row.anchor_right = 1.0
	top_row.anchor_bottom = 0.0
	top_row.offset_left = 12.0
	top_row.offset_top = 10.0
	top_row.offset_right = -12.0
	top_row.offset_bottom = 150.0
	top_row.add_theme_constant_override("separation", 12)
	add_child(top_row)

	var brand_panel := _make_panel(Vector2(200.0, 0.0))
	top_row.add_child(brand_panel)
	var brand_pad := _make_margin(14, 10, 14, 12)
	brand_panel.add_child(brand_pad)
	var brand_box := VBoxContainer.new()
	brand_box.add_theme_constant_override("separation", 2)
	brand_pad.add_child(brand_box)
	_brand_ep = _make_label("EPISODE I", 10, COLOR_CYAN, true)
	_brand_title = _make_label("FLASH ONLINE", 15, COLOR_TEXT, true)
	brand_box.add_child(_brand_ep)
	brand_box.add_child(_brand_title)

	var mission_panel := _make_panel(Vector2.ZERO)
	mission_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(mission_panel)
	var mission_pad := _make_margin(16, 10, 16, 10)
	mission_panel.add_child(mission_pad)
	var mission_box := VBoxContainer.new()
	mission_box.alignment = BoxContainer.ALIGNMENT_CENTER
	mission_box.add_theme_constant_override("separation", 4)
	mission_pad.add_child(mission_box)
	_mission_zone = _make_label("Pioneer 2 - Hunter's Guild", 12, COLOR_CYAN, true)
	_mission_zone.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mission_objective = _make_label("Board the telepipe again for another Forest 1 run.", 13, COLOR_TEXT, false)
	_mission_objective.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mission_objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mission_box.add_child(_mission_zone)
	mission_box.add_child(_mission_objective)

	var radar_panel := _make_panel(Vector2(180.0, 132.0))
	top_row.add_child(radar_panel)
	var radar_root := Control.new()
	radar_root.custom_minimum_size = Vector2(180.0, 132.0)
	radar_panel.add_child(radar_root)

	_radar_label = _make_label("PIONEER 2", 10, COLOR_CYAN, true)
	_radar_label.position = Vector2(10.0, 8.0)
	radar_root.add_child(_radar_label)

	_radar_sub = _make_label("MANUAL AIM", 10, COLOR_TEXT_DIM, false)
	_radar_sub.position = Vector2(10.0, 24.0)
	radar_root.add_child(_radar_sub)

	_radar_phase = _make_label("LOBBY", 10, COLOR_TEXT_DIM, false)
	_radar_phase.position = Vector2(10.0, 40.0)
	radar_root.add_child(_radar_phase)

	_radar_ring = _make_label("◉", 62, Color(0.76, 0.97, 1.0, 0.24), true)
	_radar_ring.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_radar_ring.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_radar_ring.position = Vector2(43.0, 24.0)
	_radar_ring.size = Vector2(92.0, 92.0)
	radar_root.add_child(_radar_ring)

	_radar_sweep = ColorRect.new()
	_radar_sweep.color = Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.28)
	_radar_sweep.position = Vector2(89.0, 27.0)
	_radar_sweep.size = Vector2(2.0, 42.0)
	_radar_sweep.pivot_offset = Vector2(1.0, 39.0)
	radar_root.add_child(_radar_sweep)

	_radar_blip = ColorRect.new()
	_radar_blip.position = Vector2(86.0, 67.0)
	_radar_blip.size = Vector2(8.0, 8.0)
	radar_root.add_child(_radar_blip)

func _build_status_panel() -> void:
	var panel := _make_panel(Vector2.ZERO)
	panel.anchor_left = 0.0
	panel.anchor_top = 1.0
	panel.anchor_right = 0.0
	panel.anchor_bottom = 1.0
	panel.offset_left = 12.0
	panel.offset_top = -172.0
	panel.offset_right = 372.0
	panel.offset_bottom = -96.0
	add_child(panel)

	var pad := _make_margin(14, 12, 14, 12)
	panel.add_child(pad)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	pad.add_child(row)

	var portrait := PanelContainer.new()
	portrait.custom_minimum_size = Vector2(72.0, 72.0)
	portrait.add_theme_stylebox_override("panel", _make_panel_style(Color(0.0392, 0.1569, 0.251, 1.0), Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.35)))
	row.add_child(portrait)
	var portrait_label := _make_label("HUNTER", 11, Color(0.78, 0.95, 1.0, 0.42), true)
	portrait_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	portrait_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	portrait_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait.add_child(portrait_label)

	var main := VBoxContainer.new()
	main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	main.add_theme_constant_override("separation", 6)
	row.add_child(main)

	var job_row := HBoxContainer.new()
	job_row.add_theme_constant_override("separation", 10)
	main.add_child(job_row)
	_job_label = _make_label("HUmar", 14, COLOR_TEXT, true)
	_level_label = _make_label("LV 1", 12, COLOR_CYAN, false)
	_warn_label = _make_label("DAMAGE", 10, COLOR_WARN, true)
	_warn_label.visible = false
	job_row.add_child(_job_label)
	job_row.add_child(_level_label)
	job_row.add_child(_warn_label)

	_status_mode = _make_label("MANUAL AIM", 11, COLOR_TEXT_DIM, false)
	main.add_child(_status_mode)

	var hp_row := _make_stat_row("HP", COLOR_HP)
	_hp_bar = hp_row["bar"]
	_hp_value = hp_row["value"]
	main.add_child(hp_row["row"])

	var tech_row := _make_stat_row("TECH", COLOR_TECH)
	_tech_bar = tech_row["bar"]
	_tech_value = tech_row["value"]
	main.add_child(tech_row["row"])

	var mission_row := _make_stat_row("MISSION", COLOR_PROGRESS)
	_mission_bar = mission_row["bar"]
	_mission_value = mission_row["value"]
	main.add_child(mission_row["row"])

func _make_stat_row(label_text: String, fill_color: Color) -> Dictionary:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var label := _make_label(label_text, 10, COLOR_TEXT_DIM, true)
	label.custom_minimum_size = Vector2(50.0, 0.0)
	row.add_child(label)

	var bar := ProgressBar.new()
	bar.show_percentage = false
	bar.min_value = 0.0
	bar.max_value = 100.0
	bar.value = 100.0
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.custom_minimum_size = Vector2(0.0, 14.0)
	bar.add_theme_stylebox_override("background", _make_bar_bg())
	bar.add_theme_stylebox_override("fill", _make_bar_fill(fill_color))
	row.add_child(bar)

	var value := _make_label("READY", 11, Color(0.91, 0.97, 1.0, 0.78), false)
	value.custom_minimum_size = Vector2(92.0, 0.0)
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(value)

	return {
		"row": row,
		"bar": bar,
		"value": value,
	}

func _build_prompt_stack() -> void:
	var prompt_center := CenterContainer.new()
	prompt_center.anchor_left = 0.0
	prompt_center.anchor_top = 0.0
	prompt_center.anchor_right = 1.0
	prompt_center.anchor_bottom = 0.0
	prompt_center.offset_top = 84.0
	prompt_center.offset_bottom = 112.0
	add_child(prompt_center)

	_prompt_panel = _make_panel(Vector2.ZERO)
	_prompt_panel.visible = false
	prompt_center.add_child(_prompt_panel)
	var prompt_pad := _make_margin(16, 5, 16, 5)
	_prompt_panel.add_child(prompt_pad)
	_prompt_label = _make_label("", 10, COLOR_TEXT, true)
	_prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_pad.add_child(_prompt_label)

	var wave_center := CenterContainer.new()
	wave_center.anchor_left = 0.0
	wave_center.anchor_top = 0.0
	wave_center.anchor_right = 1.0
	wave_center.anchor_bottom = 0.0
	wave_center.offset_top = 118.0
	wave_center.offset_bottom = 150.0
	add_child(wave_center)

	_wave_panel = _make_panel(Vector2.ZERO)
	wave_center.add_child(_wave_panel)
	var wave_pad := _make_margin(22, 6, 22, 6)
	_wave_panel.add_child(wave_pad)
	_wave_label = _make_label("HUNTERS GUILD - TELEPIPE READY", 11, Color(0.05, 0.12, 0.16, 1.0), true)
	_wave_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wave_pad.add_child(_wave_label)

func _build_palette() -> void:
	var palette_center := CenterContainer.new()
	palette_center.anchor_left = 0.0
	palette_center.anchor_top = 1.0
	palette_center.anchor_right = 1.0
	palette_center.anchor_bottom = 1.0
	palette_center.offset_top = -116.0
	palette_center.offset_bottom = -8.0
	add_child(palette_center)

	var palette_box := VBoxContainer.new()
	palette_box.add_theme_constant_override("separation", 8)
	palette_center.add_child(palette_box)

	var palette_label := _make_label("PALETTE", 9, Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.6), true)
	palette_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	palette_box.add_child(palette_label)

	var slots_row := HBoxContainer.new()
	slots_row.add_theme_constant_override("separation", 10)
	palette_box.add_child(slots_row)

	var normal_slot := _make_slot("1 · LMB", "NORMAL")
	_normal_cd = normal_slot["cd"]
	_normal_hint = normal_slot["hint"]
	slots_row.add_child(normal_slot["panel"])

	var heavy_slot := _make_slot("2", "HEAVY")
	_heavy_cd = heavy_slot["cd"]
	_heavy_hint = heavy_slot["hint"]
	slots_row.add_child(heavy_slot["panel"])

	var tech_slot := _make_slot("3", "TECH")
	_tech_cd = tech_slot["cd"]
	_tech_hint = tech_slot["hint"]
	slots_row.add_child(tech_slot["panel"])

	_palette_meta = _make_label("E TO LOCK · RMB CAM", 10, COLOR_TEXT_DIM, false)
	_palette_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	palette_box.add_child(_palette_meta)

func _make_slot(key_text: String, name_text: String) -> Dictionary:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(88.0, 74.0)
	_slot_panels.append(panel)
	panel.add_theme_stylebox_override("panel", _make_slot_style(Color(COLOR_HUB_EDGE.r, COLOR_HUB_EDGE.g, COLOR_HUB_EDGE.b, 0.22)))

	var pad := _make_margin(6, 8, 6, 8)
	panel.add_child(pad)

	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 2)
	pad.add_child(box)

	var key := _make_label(key_text, 15, COLOR_CYAN, true)
	key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(key)

	var name := _make_label(name_text, 11, COLOR_TEXT, true)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(name)

	var hint := _make_label("Ready", 10, Color(0.91, 0.97, 1.0, 0.46), false)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(hint)

	var cd := _make_label("0.0", 13, COLOR_SLOT_CD, true)
	cd.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cd.visible = false
	box.add_child(cd)

	return {
		"panel": panel,
		"hint": hint,
		"cd": cd,
	}

func _make_panel(min_size: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.custom_minimum_size = min_size
	_zone_panels.append(panel)
	return panel

func _make_margin(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin

func _make_label(text_value: String, font_size: int, color: Color, heading: bool) -> Label:
	var label := Label.new()
	label.text = text_value
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	if heading:
		label.add_theme_color_override("font_shadow_color", Color(color.r, color.g, color.b, 0.16))
		label.add_theme_constant_override("shadow_outline_size", 1)
	return label

func _apply_zone_style(mission_active: bool) -> void:
	var panel_color := COLOR_FIELD_PANEL if mission_active else COLOR_HUB_PANEL
	var edge_color := COLOR_FIELD_EDGE if mission_active else COLOR_HUB_EDGE
	for panel in _zone_panels:
		panel.add_theme_stylebox_override("panel", _make_panel_style(panel_color, edge_color))
	for panel in _slot_panels:
		panel.add_theme_stylebox_override("panel", _make_slot_style(edge_color))

	var wave_text_color := Color(0.05, 0.12, 0.16, 1.0)
	var wave_fill := Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.88)
	if not mission_active:
		wave_text_color = COLOR_TEXT
		wave_fill = Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.26)
	_wave_panel.add_theme_stylebox_override("panel", _make_banner_style(wave_fill, edge_color))
	_wave_label.add_theme_color_override("font_color", wave_text_color)

func _make_panel_style(bg: Color, edge: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.border_color = edge
	style.expand_margin_left = 1.0
	style.expand_margin_top = 1.0
	style.expand_margin_right = 1.0
	style.expand_margin_bottom = 1.0
	return style

func _make_slot_style(edge: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = COLOR_SLOT_BG
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.border_color = edge
	return style

func _make_banner_style(bg: Color, edge: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.border_color = edge
	return style

func _make_bar_bg() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.45)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.border_color = Color(COLOR_CYAN.r, COLOR_CYAN.g, COLOR_CYAN.b, 0.22)
	return style

func _make_bar_fill(fill: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	return style
