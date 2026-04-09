extends Node

enum MissionPhase { HUB, FIELD_DEPLOY, FIELD_COMBAT, FIELD_CLEAR, FIELD_DOWN }

@onready var world_root: Node3D = $"../WorldRoot"
@onready var hud: Node = $"../UI/Hud"
@onready var player: CharacterBody3D = $"../Player"
@onready var audio: Node = $"../Audio"
@onready var sun: DirectionalLight3D = $"../Sun"
@onready var fill_light: DirectionalLight3D = $"../FillLight"
@onready var world_environment: WorldEnvironment = $"../WorldEnvironment"

var phase: MissionPhase = MissionPhase.HUB
var mission_elapsed := 0.0
var can_interact := false
var lock_target: Node3D = null

var hub_scene: PackedScene = preload("res://scenes/Hub.tscn")
var forest_scene: PackedScene = preload("res://scenes/Forest1.tscn")

var current_world: Node3D
var current_telepipe: Area3D
var wave_mgr: Node = null
var wave := 0
var remaining := 0
var waves_total := 0
var _lock_on := false
var _cycle_idx := -1
var _reticle: Node3D = null
var _reticle_scene: PackedScene = preload("res://scenes/LockReticle.tscn")
var _reticle_t := 0.0
var death_return_timer := 0.0
var mission_title := "Pioneer 2 - Hunter's Guild"
var mission_objective := "Board the telepipe again for another Forest 1 run."
var mission_job := "HUmar"
var transient_hint := ""
var transient_hint_timer := 0.0

func _ready() -> void:
	if player and player.has_signal("died"):
		player.connect("died", Callable(self, "_on_player_died"))
	if audio and audio.has_method("prime"):
		audio.call("prime", "hub")
	_load_hub()
	call_deferred("_update_hud")

func _process(delta: float) -> void:
	_reticle_t += delta
	if phase == MissionPhase.FIELD_DEPLOY or phase == MissionPhase.FIELD_COMBAT or phase == MissionPhase.FIELD_CLEAR:
		mission_elapsed += delta

	if transient_hint_timer > 0.0:
		transient_hint_timer = maxf(0.0, transient_hint_timer - delta)
		if transient_hint_timer == 0.0:
			transient_hint = ""

	if death_return_timer > 0.0:
		death_return_timer = maxf(0.0, death_return_timer - delta)
		if death_return_timer == 0.0:
			_return_to_hub()
			if player and player.has_method("respawn_full"):
				player.call("respawn_full")

	if Input.is_action_just_pressed("interact"):
		_on_interact_pressed()

	if Input.is_action_just_pressed("lock_on"):
		_toggle_lock_on()

	if Input.is_action_just_pressed("cycle_target"):
		_cycle_lock_target()

	_refresh_lock_target()
	_update_reticle()

	_update_hud()

func _on_interact_pressed() -> void:
	match phase:
		MissionPhase.HUB:
			if _is_near_hub_telepipe():
				_enter_mission()
			elif _is_near_guild_clerk():
				_play_ui("ui_click")
				_show_hint("Guild Clerk: \"Forest 1 is live. Use the telepipe when you are ready, hunter.\"", 4.5)
		MissionPhase.FIELD_CLEAR:
			if _is_near_return_telepipe():
				_return_to_hub()
				_show_hint("Returned to Pioneer 2. Meseta and XP were saved to your character.", 4.5)
		_:
			if can_interact:
				_return_to_hub()

func _enter_mission() -> void:
	_play_sfx("teleport")
	phase = MissionPhase.FIELD_DEPLOY
	mission_elapsed = 0.0
	mission_title = "Forest 1 - VR Field"
	mission_objective = "Deploying... Clear all waves, then use the return telepipe."
	mission_job = "HUmar"
	_show_hint("PSO controls: camera-relative WASD, wheel zoom, Q lock-on, 1/LMB combo, 2 heavy, 3 tech.", 6.0)
	_load_forest()
	phase = MissionPhase.FIELD_COMBAT
	mission_objective = "Clear all hostiles, then extract via the return telepipe."

func _return_to_hub() -> void:
	_play_sfx("teleport")
	phase = MissionPhase.HUB
	mission_elapsed = 0.0
	mission_title = "Pioneer 2 - Hunter's Guild"
	mission_objective = "Quest complete. Board the telepipe again for another Forest 1 run."
	mission_job = "HUmar"
	_load_hub()

func _show_hint(text: String, seconds: float = 4.0) -> void:
	transient_hint = text
	transient_hint_timer = seconds

func _guild_clerk() -> Node3D:
	if not current_world:
		return null
	return current_world.get_node_or_null("Generated/GuildClerk") as Node3D

func _is_near_guild_clerk() -> bool:
	var clerk := _guild_clerk()
	if not clerk or not player:
		return false
	var d := clerk.global_position - player.global_position
	d.y = 0.0
	return d.length() < 2.8

func _is_near_hub_telepipe() -> bool:
	if phase != MissionPhase.HUB or not current_telepipe or not player:
		return false
	var d := current_telepipe.global_position - player.global_position
	d.y = 0.0
	return d.length() < 3.2

func _is_near_return_telepipe() -> bool:
	if phase != MissionPhase.FIELD_CLEAR or not current_telepipe or not player:
		return false
	var d := current_telepipe.global_position - player.global_position
	d.y = 0.0
	return d.length() < 2.75

func _clear_world_root() -> void:
	for c in world_root.get_children():
		world_root.remove_child(c)
		c.queue_free()

func _load_hub() -> void:
	_clear_world_root()
	current_world = hub_scene.instantiate() as Node3D
	world_root.add_child(current_world)
	_apply_zone_atmosphere("hub")
	_set_zone_music("hub")
	_bind_world()

func _load_forest() -> void:
	_clear_world_root()
	current_world = forest_scene.instantiate() as Node3D
	world_root.add_child(current_world)
	_apply_zone_atmosphere("forest")
	_set_zone_music("forest1")
	_bind_world()

func _apply_zone_atmosphere(zone: String) -> void:
	if not world_environment or not world_environment.environment:
		return

	var env := world_environment.environment
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.fog_enabled = true
	env.fog_aerial_perspective = 0.0
	env.fog_sky_affect = 0.0

	match zone:
		"hub":
			env.background_color = Color(0.415686, 0.619608, 0.768627, 1.0)
			env.ambient_light_color = Color(0.533333, 0.627451, 0.784314, 1.0)
			env.ambient_light_energy = 0.22
			env.fog_light_color = Color(0.494118, 0.721569, 0.862745, 1.0)
			env.fog_density = 0.012
			if sun:
				sun.light_color = Color(1.0, 0.94902, 0.866667, 1.0)
				sun.light_energy = 1.22
				sun.position = Vector3(18.0, 26.0, 12.0)
				sun.rotation_degrees = Vector3(-65.0, 56.0, 0.0)
			if fill_light:
				fill_light.light_color = Color(0.533333, 0.784314, 1.0, 1.0)
				fill_light.light_energy = 0.42
				fill_light.position = Vector3(-22.0, 14.0, -10.0)
				fill_light.rotation_degrees = Vector3(-37.0, -114.0, 0.0)
		"forest":
			env.background_color = Color(0.05098, 0.121569, 0.094118, 1.0)
			env.ambient_light_color = Color(0.164706, 0.25098, 0.219608, 1.0)
			env.ambient_light_energy = 0.18
			env.fog_light_color = Color(0.101961, 0.2, 0.156863, 1.0)
			env.fog_density = 0.026
			if sun:
				sun.light_color = Color(0.784314, 0.909804, 0.847059, 1.0)
				sun.light_energy = 0.95
				sun.position = Vector3(18.0, 26.0, 12.0)
				sun.rotation_degrees = Vector3(-65.0, 56.0, 0.0)
			if fill_light:
				fill_light.light_color = Color(0.266667, 0.533333, 0.4, 1.0)
				fill_light.light_energy = 0.28
				fill_light.position = Vector3(-22.0, 14.0, -10.0)
				fill_light.rotation_degrees = Vector3(-37.0, -114.0, 0.0)
		_:
			env.fog_density = 0.01

func _bind_world() -> void:
	can_interact = false
	current_telepipe = current_world.get_node_or_null("Telepipe") as Area3D
	if current_telepipe:
		current_telepipe.body_entered.connect(_on_telepipe_body_entered)
		current_telepipe.body_exited.connect(_on_telepipe_body_exited)

	wave_mgr = current_world.get_node_or_null("WaveManager")
	wave = 0
	remaining = 0
	waves_total = 0
	if wave_mgr:
		# Connect if present; wave manager autostarts.
		if wave_mgr.has_signal("wave_changed"):
			wave_mgr.connect("wave_changed", Callable(self, "_on_wave_changed"))
		if wave_mgr.has_signal("all_waves_cleared"):
			wave_mgr.connect("all_waves_cleared", Callable(self, "_on_all_waves_cleared"))
		# Pull current status in case we missed the first emit.
		if wave_mgr.has_method("get_status"):
			var st: Dictionary = wave_mgr.call("get_status")
			wave = int(st.get("wave", 0))
			remaining = int(st.get("remaining", 0))
			waves_total = int(st.get("waves_total", 0))

	var spawn := current_world.get_node_or_null("Spawn") as Node3D
	if spawn and player:
		if current_world.has_method("get_spawn_position"):
			var spawn_pos: Vector3 = current_world.call("get_spawn_position")
			player.global_position = spawn_pos
		else:
			player.global_position = spawn.global_position
		lock_target = null
		_lock_on = false
		death_return_timer = 0.0
		if player.has_method("set_lock_on"):
			player.call("set_lock_on", false)
		if player.has_method("set_lock_target"):
			player.call("set_lock_target", null)

	# Ensure reticle exists once.
	if not _reticle:
		_reticle = _reticle_scene.instantiate() as Node3D
		add_child(_reticle)
		_reticle.visible = false

func _toggle_lock_on() -> void:
	_lock_on = not _lock_on
	if player and player.has_method("set_lock_on"):
		player.call("set_lock_on", _lock_on)
	if not _lock_on:
		lock_target = null
		if player and player.has_method("set_lock_target"):
			player.call("set_lock_target", null)
		return
	_pick_lock_target_best()
	if lock_target:
		_play_sfx("lock_on")

func _pick_lock_target_best() -> void:
	if phase == MissionPhase.HUB:
		lock_target = null
		if player and player.has_method("set_lock_target"):
			player.call("set_lock_target", null)
		return

	var list := _sorted_targets()
	lock_target = list[0] if not list.is_empty() else null
	if player and player.has_method("set_lock_target"):
		player.call("set_lock_target", lock_target)

func _cycle_lock_target() -> void:
	if not _lock_on or phase == MissionPhase.HUB:
		return
	var list := _sorted_targets()
	if list.is_empty():
		lock_target = null
		if player and player.has_method("set_lock_target"):
			player.call("set_lock_target", null)
		return

	var idx := list.find(lock_target)
	if idx == -1:
		idx = 0
	else:
		idx = (idx + 1) % list.size()
	_cycle_idx = idx
	lock_target = list[idx]
	if player and player.has_method("set_lock_target"):
		player.call("set_lock_target", lock_target)

func _refresh_lock_target() -> void:
	if not _lock_on:
		return
	if lock_target and is_instance_valid(lock_target):
		return
	_pick_lock_target_best()

func _enemy_list() -> Array[Node3D]:
	var out: Array[Node3D] = []
	var enemies := current_world.get_node_or_null("Enemies") as Node3D
	if not enemies:
		return out
	for c in enemies.get_children():
		if c is Node3D and is_instance_valid(c):
			out.append(c as Node3D)
	return out

func _camera_forward_flat() -> Vector3:
	if not player:
		return Vector3.FORWARD
	var pivot := player.get_node_or_null("CameraPivot") as Node3D
	if pivot:
		var f := -pivot.global_transform.basis.z
		f.y = 0.0
		if f.length() > 0.001:
			return f.normalized()
	var pf := -player.global_transform.basis.z
	pf.y = 0.0
	return pf.normalized() if pf.length() > 0.001 else Vector3.FORWARD

func _sorted_targets() -> Array[Node3D]:
	var enemies := _enemy_list()
	if enemies.is_empty() or not player:
		return []

	var origin := player.global_position
	var cam_f := _camera_forward_flat()
	var scored: Array[Dictionary] = []

	for e in enemies:
		var to := e.global_position - origin
		to.y = 0.0
		var dist := to.length()
		if dist < 0.001:
			continue
		var dir := to / dist
		var dot := cam_f.dot(dir)
		var in_front := dot > 0.15
		var angle_penalty := 1.0 - dot if in_front else 99.0
		var score := angle_penalty * 20.0 + dist * 0.08
		scored.append({
			"node": e,
			"score": score,
			"dist": dist,
			"in_front": in_front,
		})

	if scored.is_empty():
		return []

	scored.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var af := bool(a.get("in_front", false))
		var bf := bool(b.get("in_front", false))
		if af != bf:
			return af and not bf
		return float(a.get("score", 99999.0)) < float(b.get("score", 99999.0))
	)

	var out: Array[Node3D] = []
	for item in scored:
		out.append(item["node"] as Node3D)
	return out

func _update_reticle() -> void:
	var has_target := _lock_on and lock_target and is_instance_valid(lock_target)
	for e in _enemy_list():
		if e.has_method("set_targeted"):
			e.call("set_targeted", has_target and e == lock_target)

	if not _reticle:
		return
	if has_target:
		var pulse := 1.0 + sin(_reticle_t * 7.5) * 0.12
		_reticle.visible = true
		_reticle.global_position = lock_target.global_position + Vector3(0, 1.15, 0)
		_reticle.scale = Vector3.ONE * pulse
		_reticle.rotation_degrees = Vector3(0.0, _reticle_t * 160.0, 90.0)
	else:
		_reticle.visible = false

func _on_telepipe_body_entered(body: Node) -> void:
	if body == player:
		can_interact = (phase == MissionPhase.HUB) or (phase == MissionPhase.FIELD_CLEAR)

func _on_telepipe_body_exited(body: Node) -> void:
	if body == player:
		can_interact = false

func _on_wave_changed(w: int, r: int) -> void:
	wave = w
	remaining = r

func _on_all_waves_cleared() -> void:
	phase = MissionPhase.FIELD_CLEAR
	mission_objective = "Quest complete. Use the return telepipe."
	_show_hint("Field clear. Return to Pioneer 2.", 4.0)
	_play_sfx("wave_complete")

func _on_player_died() -> void:
	if phase == MissionPhase.HUB:
		if player and player.has_method("respawn_full"):
			player.call("respawn_full")
		return
	phase = MissionPhase.FIELD_DOWN
	can_interact = false
	death_return_timer = 2.0
	mission_objective = "Mission failed. Returning to Pioneer 2..."
	if wave_mgr and wave_mgr.has_method("stop"):
		wave_mgr.call("stop")

func _update_hud() -> void:
	var interact_prompt := ""
	if phase == MissionPhase.HUB:
		if _is_near_hub_telepipe():
			interact_prompt = "E - Forest 1 (Telepipe)"
		elif _is_near_guild_clerk():
			interact_prompt = "E - Hunter's Guild"
	elif phase == MissionPhase.FIELD_CLEAR:
		if _is_near_return_telepipe():
			interact_prompt = "E - Return to Pioneer 2"
		else:
			interact_prompt = "Return to the telepipe"
	elif phase == MissionPhase.FIELD_COMBAT:
		interact_prompt = "Clear the wave (%d remaining)" % remaining
	elif phase == MissionPhase.FIELD_DOWN:
		interact_prompt = "Returning to Pioneer 2..."
	else:
		interact_prompt = "Find the telepipe (circle) to interact"

	var prompt := transient_hint if transient_hint != "" else interact_prompt
	var lock_on := false
	var target_name := ""
	if player and player.has_method("is_lock_on"):
		lock_on = bool(player.call("is_lock_on"))
		if player.has_method("get_lock_target_name") and player.call("is_lock_on"):
			target_name = str(player.call("get_lock_target_name"))

	var hp := 0
	var max_hp := 100
	var hurt := false
	var cd_n := 0.0
	var cd_h := 0.0
	var cd_t := 0.0
	var cd_t_max := 1.0
	if player and player.has_method("get_hud_stats"):
		var s: Dictionary = player.call("get_hud_stats")
		hp = int(s.get("hp", 0))
		max_hp = int(s.get("max_hp", 100))
		hurt = float(s.get("hurt", 0.0)) > 0.0
		cd_n = float(s.get("cd_normal", 0.0))
		cd_h = float(s.get("cd_heavy", 0.0))
		cd_t = float(s.get("cd_tech", 0.0))
		cd_t_max = maxf(0.001, float(s.get("cd_tech_max", 1.0)))

	var mission_active := phase != MissionPhase.HUB
	var mission_clock := ""
	if mission_active:
		var mins := int(floor(mission_elapsed / 60.0))
		var secs := int(floor(fmod(mission_elapsed, 60.0)))
		mission_clock = "%d:%02d" % [mins, secs]

	var phase_label := "LOBBY"
	match phase:
		MissionPhase.FIELD_DEPLOY:
			phase_label = "DEPLOY"
		MissionPhase.FIELD_COMBAT:
			phase_label = "COMBAT"
		MissionPhase.FIELD_CLEAR:
			phase_label = "CLEAR"
		MissionPhase.FIELD_DOWN:
			phase_label = "DOWN"

	var mission_pct := 0.0
	if phase == MissionPhase.HUB:
		mission_pct = 1.0
	elif phase == MissionPhase.FIELD_CLEAR:
		mission_pct = 1.0
	elif waves_total > 0:
		mission_pct = clampf(float(maxi(wave - 1, 0)) / float(waves_total), 0.0, 1.0)

	var mission_text := "TELEPIPE READY"
	if mission_active:
		mission_text = "%s · WAVE %d/%d" % [phase_label, maxi(wave, 1), maxi(waves_total, 1)]

	var palette_meta := "COMBAT READY · %s · RMB CAM" % ("LOCK-ON" if lock_on else "E TO LOCK")
	if target_name != "":
		palette_meta += " · %s" % target_name

	var status_mode := "TARGET LOCK" if lock_on else "MANUAL AIM"
	if phase == MissionPhase.FIELD_DOWN:
		status_mode = "RETURNING TO PIONEER 2"

	var wave_text := "HUNTERS GUILD - TELEPIPE READY"
	if mission_active:
		wave_text = "WAVE %d - REMAINING %d" % [maxi(wave, 1), maxi(remaining, 0)]
		if phase == MissionPhase.FIELD_CLEAR:
			wave_text = "MISSION CLEAR - RETURN TO TELEPIPE"
		elif phase == MissionPhase.FIELD_DOWN:
			wave_text = "MISSION FAILED - RETURNING"

	var tech_ready := 1.0 - clampf(cd_t / cd_t_max, 0.0, 1.0)
	var tech_text := "READY" if cd_t <= 0.05 else "%.1fs" % cd_t

	if hud and hud.has_method("update_view"):
		hud.call("update_view", {
			"brand_ep": "EPISODE I",
			"brand_title": "FLASH ONLINE",
			"mission_active": mission_active,
			"title": mission_title,
			"objective": mission_objective,
			"map_label": "PIONEER 2" if phase == MissionPhase.HUB else "FOREST 1",
			"mission_clock": mission_clock,
			"phase_label": phase_label,
			"lock_on": lock_on,
			"target_name": target_name,
			"job": mission_job,
			"level": 1,
			"status_mode": status_mode,
			"hp": hp,
			"max_hp": max_hp,
			"hurt": hurt,
			"tech_pct": tech_ready,
			"tech_text": tech_text,
			"mission_pct": mission_pct,
			"mission_text": mission_text,
			"prompt": prompt,
			"wave_text": wave_text,
			"cd_normal": cd_n,
			"cd_heavy": cd_h,
			"cd_tech": cd_t,
			"palette_meta": palette_meta,
		})

func _play_sfx(key: String, rate: float = 1.0, volume_db: float = 0.0) -> void:
	if audio and audio.has_method("play_sfx"):
		audio.call("play_sfx", key, rate, volume_db)

func _play_ui(key: String = "ui_click") -> void:
	if audio and audio.has_method("play_ui"):
		audio.call("play_ui", key)

func _set_zone_music(zone: String) -> void:
	if audio and audio.has_method("set_zone_music"):
		audio.call("set_zone_music", zone)

