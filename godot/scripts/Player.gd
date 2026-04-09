extends CharacterBody3D

signal died

@export var walk_speed := 4.1
@export var run_speed := 6.6
@export var jump_velocity := 5.2
@export var gravity := 14.0
@export var accel := 28.0
@export var brake := 32.0
@export var turn_speed := 14.0
@export var free_turn_rate := 2.8
@export var backpedal_speed_scale := 0.65

@export var mouse_sensitivity := 0.0035
@export var zoom_speed := 0.8
@export var zoom_min := 2.15
@export var zoom_max := 7.85
@export var camera_pitch_min_deg := 5.0
@export var camera_pitch_max_deg := 72.0
@export var camera_catchup_delay := 2.8
@export var camera_catchup_rate := 3.6
@export var camera_key_turn_rate := 1.85
@export var lock_face_rate := 14.0
@export var lock_camera_rate := 2.85
@export var blaster_range := 22.0
@export var blaster_fire_rate := 9.0 # shots/sec
@export var blaster_damage := 10
@export var heavy_damage := 22
@export var heavy_cd := 1.2
@export var tech_cd := 2.4
@export var tech_heal := 18
@export var kill_heal := 60

@onready var cam_pivot: Node3D = $CameraPivot
@onready var spring_arm: SpringArm3D = $CameraPivot/SpringArm3D
@onready var visual_root: Node3D = $Visual

var cam_yaw := PI
var cam_pitch := deg_to_rad(22.0)
var orbiting := false
var manual_cam_timer := 0.0

var lock_on := false
var lock_target: Node3D = null

var max_hp := 120
var hp := 120
var _cd_normal := 0.0
var _cd_heavy := 0.0
var _cd_tech := 0.0
var _hurt_flash := 0.0
var dead := false
var _anim_player: AnimationPlayer = null
var _anim_idle := ""
var _anim_move := ""
var _anim_current := ""
var _grounded_by_height := false
var _impact_impulse := Vector3.ZERO
var _footstep_timer := 0.0
var _footstep_idx := 0
var _combo_audio_idx := 0

func _ready() -> void:
	add_to_group("player")
	spring_arm.spring_length = clampf(spring_arm.spring_length, zoom_min, zoom_max)
	_apply_camera_angles()
	_apply_visual_style(visual_root, Color(1.0, 1.0, 1.0, 1.0))
	_setup_animation()
	# Keep free movement stable: only rotate camera when explicitly requested.
	orbiting = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			# Keep RMB as a convenience toggle for mouse capture on desktops.
			orbiting = not orbiting
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if orbiting else Input.MOUSE_MODE_VISIBLE
			manual_cam_timer = camera_catchup_delay
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			spring_arm.spring_length = clampf(spring_arm.spring_length - zoom_speed, zoom_min, zoom_max)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			spring_arm.spring_length = clampf(spring_arm.spring_length + zoom_speed, zoom_min, zoom_max)

	if event.is_action_pressed("toggle_camera"):
		orbiting = not orbiting
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if orbiting else Input.MOUSE_MODE_VISIBLE
		manual_cam_timer = camera_catchup_delay

	if orbiting and event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		cam_yaw -= mm.relative.x * mouse_sensitivity
		cam_pitch -= mm.relative.y * mouse_sensitivity
		cam_pitch = clampf(cam_pitch, deg_to_rad(camera_pitch_min_deg), deg_to_rad(camera_pitch_max_deg))
		_apply_camera_angles()
		manual_cam_timer = camera_catchup_delay

	# lock_on is controlled by Game.gd to avoid input double-handling.

func _physics_process(delta: float) -> void:
	_hurt_flash = maxf(0.0, _hurt_flash - delta)
	_cd_normal = maxf(0.0, _cd_normal - delta)
	_cd_heavy = maxf(0.0, _cd_heavy - delta)
	_cd_tech = maxf(0.0, _cd_tech - delta)
	_impact_impulse = _impact_impulse.move_toward(Vector3.ZERO, 26.0 * delta)

	if dead:
		velocity.x = move_toward(velocity.x, 0.0, brake * delta)
		velocity.z = move_toward(velocity.z, 0.0, brake * delta)
		if not is_on_floor():
			velocity.y -= gravity * delta
		else:
			velocity.y = 0.0
		move_and_slide()
		_update_animation(false)
		return

	if Input.is_action_pressed("attack_normal") and _cd_normal <= 0.0:
		_cd_normal = 1.0 / maxf(1.0, blaster_fire_rate)
		_do_attack(false)
	if Input.is_action_just_pressed("attack_heavy") and _cd_heavy <= 0.0:
		_cd_heavy = heavy_cd
		_do_attack(true)
	if Input.is_action_just_pressed("attack_tech") and _cd_tech <= 0.0:
		_cd_tech = tech_cd
		_do_tech()

	var grounded := is_on_floor() or _grounded_by_height
	if not grounded:
		velocity.y -= gravity * delta
	else:
		velocity.y = 0.0

	# Keyboard camera nudge (no mouse required).
	if Input.is_action_pressed("camera_left"):
		cam_yaw += camera_key_turn_rate * delta
		manual_cam_timer = camera_catchup_delay
	if Input.is_action_pressed("camera_right"):
		cam_yaw -= camera_key_turn_rate * delta
		manual_cam_timer = camera_catchup_delay
	if Input.is_action_pressed("camera_up"):
		cam_pitch += camera_key_turn_rate * 0.6 * delta
		manual_cam_timer = camera_catchup_delay
	if Input.is_action_pressed("camera_down"):
		cam_pitch -= camera_key_turn_rate * 0.6 * delta
		manual_cam_timer = camera_catchup_delay
	cam_pitch = clampf(cam_pitch, deg_to_rad(camera_pitch_min_deg), deg_to_rad(camera_pitch_max_deg))
	_apply_camera_angles()

	var ix := Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	var iz := Input.get_action_strength("move_forward") - Input.get_action_strength("move_back")
	var input := Vector2(ix, iz)
	if input.length() > 1.0:
		input = input.normalized()

	var speed := run_speed if Input.is_action_pressed("run") else walk_speed

	var desired_dir := Vector3.ZERO
	var has_input := input.length() > 0.01

	if lock_on:
		var forward := -cam_pivot.global_transform.basis.z
		forward.y = 0.0
		forward = forward.normalized()
		var right := cam_pivot.global_transform.basis.x
		right.y = 0.0
		right = right.normalized()
		desired_dir = (right * input.x + forward * input.y)
		if desired_dir.length() > 0.001:
			desired_dir = desired_dir.normalized()
	else:
		var turn_input := Input.get_action_strength("move_left") - Input.get_action_strength("move_right")
		if absf(turn_input) > 0.001:
			rotation.y += turn_input * free_turn_rate * delta
		var forward_input := Input.get_action_strength("move_forward") - Input.get_action_strength("move_back")
		if absf(forward_input) > 0.001:
			var facing_forward := global_transform.basis.z
			facing_forward.y = 0.0
			if facing_forward.length() > 0.001:
				facing_forward = facing_forward.normalized()
				desired_dir = facing_forward * signf(forward_input)
				speed *= 1.0 if forward_input > 0.0 else backpedal_speed_scale

	var desired_vx := desired_dir.x * speed
	var desired_vz := desired_dir.z * speed

	# Smooth locomotion: accelerate toward desired velocity, brake toward zero.
	var rate := accel if has_input else brake
	velocity.x = move_toward(velocity.x, desired_vx if has_input else 0.0, rate * delta) + _impact_impulse.x
	velocity.z = move_toward(velocity.z, desired_vz if has_input else 0.0, rate * delta) + _impact_impulse.z

	if Input.is_action_just_pressed("jump") and grounded:
		velocity.y = jump_velocity

	move_and_slide()
	_grounded_by_height = _snap_to_terrain()
	_update_animation(Vector2(velocity.x, velocity.z).length() > 0.15)
	_update_footsteps(delta, grounded, Vector2(velocity.x, velocity.z).length())

	# Lock-on: face target and bias camera toward it.
	if lock_on and lock_target and manual_cam_timer <= 0.0:
		var to := lock_target.global_position - global_position
		to.y = 0.0
		if to.length() > 0.001:
			var yaw := atan2(to.x, to.z)
			rotation.y = lerp_angle(rotation.y, yaw, 1.0 - exp(-lock_face_rate * delta))
			var desired_cam_yaw := yaw + PI
			cam_yaw = lerp_angle(cam_yaw, desired_cam_yaw, 1.0 - exp(-lock_camera_rate * delta))
			_apply_camera_angles()

	# In free-move, keep camera heading stable unless the player manually moves it.
	# Auto camera spin made W feel inconsistent because the reference frame kept changing.
	if manual_cam_timer > 0.0:
		manual_cam_timer = maxf(0.0, manual_cam_timer - delta)
	elif not lock_on and not orbiting:
		var desired_free_cam := rotation.y + PI
		cam_yaw = lerp_angle(cam_yaw, desired_free_cam, 1.0 - exp(-camera_catchup_rate * delta))
		_apply_camera_angles()

func _apply_camera_angles() -> void:
	cam_pivot.rotation = Vector3(cam_pitch, cam_yaw, 0.0)

func _snap_to_terrain() -> bool:
	var ground_y := _terrain_ground_y()
	if is_nan(ground_y):
		return false
	if velocity.y <= 0.0 and global_position.y <= ground_y + 0.08:
		global_position.y = ground_y
		velocity.y = 0.0
		return true
	return false

func _terrain_ground_y() -> float:
	var world_root := $"../WorldRoot"
	if not world_root or world_root.get_child_count() == 0:
		return NAN
	var world := world_root.get_child(0)
	if world and world.has_method("height_at"):
		return float(world.call("height_at", global_position.x, global_position.z))
	return NAN

func is_lock_on() -> bool:
	return lock_on

func set_lock_target(t: Node3D) -> void:
	lock_target = t

func set_lock_on(v: bool) -> void:
	lock_on = v
	if not lock_on:
		lock_target = null

func get_lock_target_name() -> String:
	if lock_target:
		return lock_target.name
	return ""

func get_hud_stats() -> Dictionary:
	return {
		"hp": hp,
		"max_hp": max_hp,
		"dead": dead,
		"hurt": _hurt_flash,
		"cd_normal": _cd_normal,
		"cd_normal_max": 1.0 / maxf(blaster_fire_rate, 0.001),
		"cd_heavy": _cd_heavy,
		"cd_heavy_max": heavy_cd,
		"cd_tech": _cd_tech,
		"cd_tech_max": tech_cd,
	}

func apply_damage(amount: int, from_position: Vector3 = Vector3.ZERO, _is_heavy: bool = false) -> void:
	if dead:
		return
	hp = clampi(hp - amount, 0, max_hp)
	_hurt_flash = 0.25
	_play_sfx("player_hurt", randf_range(0.98, 1.03), -2.0)
	_spawn_hit_spark(global_position + Vector3(0, 1.0, 0), Color(1.0, 0.45, 0.3), 0.18)
	_punch_visual(0.08, true)
	if from_position != Vector3.ZERO:
		var away := global_position - from_position
		away.y = 0.0
		if away.length() > 0.001:
			_impact_impulse = away.normalized() * 0.12
	if hp == 0:
		dead = true
		lock_on = false
		lock_target = null
		velocity = Vector3.ZERO
		emit_signal("died")

func respawn_full() -> void:
	hp = max_hp
	dead = false
	lock_on = false
	lock_target = null
	velocity = Vector3.ZERO
	_hurt_flash = 0.0

func _setup_animation() -> void:
	_anim_player = _find_animation_player(visual_root)
	if not _anim_player:
		return
	_anim_idle = _pick_animation(_anim_player, ["idle", "survey", "stand", "samba"])
	_anim_move = _pick_animation(_anim_player, ["run", "walk", "jog"])
	if _anim_move == "":
		_anim_move = _anim_idle
	_ensure_loop(_anim_idle)
	_ensure_loop(_anim_move)
	if _anim_idle != "":
		_play_animation(_anim_idle)

func _update_animation(moving: bool) -> void:
	if not _anim_player:
		return
	var desired := _anim_move if moving else _anim_idle
	if desired != "":
		_play_animation(desired)

func _play_animation(anim_name: String) -> void:
	if not _anim_player or anim_name == "" or _anim_current == anim_name:
		return
	_anim_current = anim_name
	_anim_player.play(anim_name)

func _find_animation_player(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n as AnimationPlayer
	for c in n.get_children():
		var ap := _find_animation_player(c)
		if ap:
			return ap
	return null

func _pick_animation(ap: AnimationPlayer, hints: Array[String]) -> String:
	var names := ap.get_animation_list()
	for hint in hints:
		for n in names:
			var s := str(n)
			if s.to_lower().contains(hint):
				return s
	if names.size() > 0:
		return str(names[0])
	return ""

func _ensure_loop(anim_name: String) -> void:
	if not _anim_player or anim_name == "":
		return
	var anim := _anim_player.get_animation(anim_name)
	if anim:
		anim.loop_mode = Animation.LOOP_LINEAR

func _apply_visual_style(root: Node, tint: Color) -> void:
	if root is MeshInstance3D:
		var mi := root as MeshInstance3D
		var surface_count := mi.mesh.get_surface_count() if mi.mesh else 0
		for surface_idx in range(surface_count):
			var base_mat := mi.get_active_material(surface_idx)
			if base_mat is BaseMaterial3D:
				var tuned := (base_mat as BaseMaterial3D).duplicate() as BaseMaterial3D
				if tuned is StandardMaterial3D:
					var sm := tuned as StandardMaterial3D
					sm.albedo_color = Color(
						sm.albedo_color.r * tint.r,
						sm.albedo_color.g * tint.g,
						sm.albedo_color.b * tint.b,
						sm.albedo_color.a
					)
					sm.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
					sm.specular_mode = BaseMaterial3D.SPECULAR_TOON
					sm.roughness = maxf(sm.roughness, 0.5)
					sm.metallic = minf(sm.metallic, 0.08)
				mi.set_surface_override_material(surface_idx, tuned)
	for child in root.get_children():
		_apply_visual_style(child, tint)

func _do_attack(is_heavy: bool) -> void:
	var from := global_position + Vector3(0, 1.2, 0)
	var dir := _blaster_dir(from)
	var to := from + dir * blaster_range
	var beam_color := Color(1.0, 0.72, 0.34) if is_heavy else Color(0.4, 1.0, 1.0)
	var beam_radius := 0.055 if is_heavy else 0.03
	var beam_energy := 1.7 if is_heavy else 1.2
	if is_heavy:
		_play_sfx("melee_heavy", 1.0, -1.5)
	else:
		var combo_key := "melee_combo_a" if (_combo_audio_idx % 2) == 0 else "melee_combo_b"
		_combo_audio_idx += 1
		_play_sfx(combo_key, 1.0, -4.0)

	var q := PhysicsRayQueryParameters3D.create(from, to)
	q.collide_with_areas = true
	q.collide_with_bodies = true
	q.exclude = [self]
	q.collision_mask = 4

	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if not hit.has("collider"):
		_spawn_hit_spark(from + dir * 0.35, beam_color, 0.1 if is_heavy else 0.07)
		_spawn_beam(from, to, beam_color, beam_radius, beam_energy)
		_punch_visual(0.05 if is_heavy else 0.03, false)
		return

	var c: Object = hit["collider"]
	if not (c is Node3D):
		_spawn_hit_spark(from + dir * 0.35, beam_color, 0.1 if is_heavy else 0.07)
		_spawn_beam(from, to, beam_color, beam_radius, beam_energy)
		_punch_visual(0.05 if is_heavy else 0.03, false)
		return

	var receiver := _damage_receiver(c as Node3D)
	if not receiver:
		_spawn_hit_spark(from + dir * 0.35, beam_color, 0.1 if is_heavy else 0.07)
		_spawn_beam(from, to, beam_color, beam_radius, beam_energy)
		_punch_visual(0.05 if is_heavy else 0.03, false)
		return

	var hit_pos: Vector3 = hit.get("position", to)
	_spawn_hit_spark(from + dir * 0.35, beam_color, 0.1 if is_heavy else 0.07)
	_spawn_beam(from, hit_pos, beam_color, beam_radius, beam_energy)
	_spawn_hit_spark(hit_pos, beam_color, 0.2 if is_heavy else 0.12)
	_punch_visual(0.05 if is_heavy else 0.03, false)

	var dmg := heavy_damage if is_heavy else blaster_damage
	var hp_before := int(receiver.get("hp")) if "hp" in receiver else -1
	receiver.call("apply_damage", int(dmg), global_position, is_heavy)
	_play_sfx("melee_impact", 1.0 if is_heavy else 1.08, -3.0 if is_heavy else -5.0)
	if hp_before > 0 and is_instance_valid(receiver) and "hp" in receiver and int(receiver.get("hp")) <= 0:
		hp = clampi(hp + kill_heal, 0, max_hp)
		_play_sfx("tech_heal", 1.0, -2.0)
		_spawn_hit_spark(global_position + Vector3(0.0, 1.0, 0.0), Color(0.35, 1.0, 0.55), 0.16)
		_punch_visual(0.035, false)

func _blaster_dir(from: Vector3) -> Vector3:
	# Prefer aiming at lock target for accuracy.
	if lock_on and lock_target:
		var aim := (lock_target.global_position + Vector3(0, 0.9, 0)) - from
		if aim.length() > 0.001:
			return aim.normalized()

	# Otherwise shoot where the camera is facing (respect pitch).
	var dir := -cam_pivot.global_transform.basis.z
	if dir.length() < 0.001:
		dir = -global_transform.basis.z
	return dir.normalized()

func _damage_receiver(n: Node3D) -> Node3D:
	var cur: Node = n
	var steps := 0
	while cur and steps < 5:
		if cur.has_method("apply_damage"):
			return cur as Node3D
		cur = cur.get_parent()
		steps += 1
	return null

func _do_tech() -> void:
	hp = clampi(hp + tech_heal, 0, max_hp)
	_play_sfx("tech_cast", 1.0, -2.0)
	_play_sfx("tech_heal", 1.0, -3.0)

func _spawn_beam(a: Vector3, b: Vector3, c: Color, radius: float = 0.03, energy: float = 1.2) -> void:
	var v := b - a
	var beam_len := v.length()
	if beam_len < 0.01:
		return
	var n := Node3D.new()
	n.name = "Beam"
	var mi := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = beam_len
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	mat.emission = c
	mat.emission_energy_multiplier = energy
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(c.r, c.g, c.b, 0.35)
	mi.material_override = mat
	n.add_child(mi)

	# Align cylinder Y-axis along direction.
	var b0 := Basis.looking_at(v.normalized(), Vector3.UP)
	# Cylinder points up (+Y), so rotate from +Y to forward.
	b0 = b0 * Basis(Vector3.RIGHT, deg_to_rad(90.0))
	n.global_transform = Transform3D(b0, a + v * 0.5)

	get_tree().current_scene.add_child(n)
	get_tree().create_timer(0.08 if radius > 0.04 else 0.06).timeout.connect(func(): n.queue_free())

func _spawn_hit_spark(p: Vector3, color: Color = Color(1.0, 1.0, 1.0), radius: float = 0.12) -> void:
	var n := Node3D.new()
	n.name = "HitSpark"
	var mi := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 2.0
	mat.albedo_color = color
	mi.material_override = mat
	n.add_child(mi)
	get_tree().current_scene.add_child(n)
	n.global_position = p
	get_tree().create_timer(0.08).timeout.connect(func(): n.queue_free())

func _punch_visual(amount: float, is_hurt: bool) -> void:
	if not visual_root:
		return
	var base_scale := Vector3(0.72, 0.72, 0.72)
	visual_root.scale = Vector3(
		base_scale.x + amount,
		base_scale.y - amount * 0.6,
		base_scale.z + amount
	) if not is_hurt else Vector3(
		base_scale.x - amount * 0.45,
		base_scale.y + amount,
		base_scale.z - amount * 0.45
	)
	var tween := create_tween()
	tween.tween_property(visual_root, "scale", base_scale, 0.12)

func _update_footsteps(delta: float, grounded: bool, move_speed_2d: float) -> void:
	if not grounded or move_speed_2d < 1.0:
		_footstep_timer = 0.0
		return
	var interval := 0.33 if Input.is_action_pressed("run") else 0.43
	_footstep_timer += delta
	if _footstep_timer >= interval:
		_footstep_timer = 0.0
		var audio := _audio()
		if audio and audio.has_method("play_footstep_variant"):
			audio.call("play_footstep_variant", _footstep_idx)
			_footstep_idx += 1

func _audio() -> Node:
	return get_tree().get_first_node_in_group("audio_manager")

func _play_sfx(key: String, rate: float = 1.0, volume_db: float = 0.0) -> void:
	var audio := _audio()
	if audio and audio.has_method("play_sfx"):
		audio.call("play_sfx", key, rate, volume_db)

