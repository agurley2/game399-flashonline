extends CharacterBody3D

@export var tuning: Resource

var max_hp := 60
@export var hp := 60

var move_speed := 3.0
var stop_distance := 4.2
var strafe_speed := 1.3

var fire_cd := 0.55
var damage := 6
var attack_range := 26.0

@export var gravity := 14.0

@onready var body: MeshInstance3D = $Body
@onready var label: Label3D = $Label3D
@onready var visual_root: Node3D = $Visual

var _t_fire := 0.0
var _anim_player: AnimationPlayer = null
var _anim_idle := ""
var _anim_move := ""
var _anim_current := ""
var _grounded_by_height := false
var _impact_impulse := Vector3.ZERO
var _targeted := false
var _target_ring: MeshInstance3D = null
func _ready() -> void:
	add_to_group("enemies")
	if tuning:
		max_hp = int(tuning.get("max_hp"))
		move_speed = float(tuning.get("move_speed"))
		stop_distance = float(tuning.get("stop_distance"))
		strafe_speed = float(tuning.get("strafe_speed"))
		fire_cd = float(tuning.get("fire_cd"))
		damage = int(tuning.get("damage"))
		attack_range = float(tuning.get("attack_range"))
		hp = max_hp
	hp = clampi(hp, 0, max_hp)
	_apply_visual_style(visual_root, Color(1.12, 0.7, 0.52, 1.0))
	_make_target_ring()
	_setup_animation()
	_update_label()

func _physics_process(delta: float) -> void:
	_t_fire = maxf(0.0, _t_fire - delta)
	_impact_impulse = _impact_impulse.move_toward(Vector3.ZERO, 12.0 * delta)
	_update_target_feedback(delta)

	var grounded := is_on_floor() or _grounded_by_height
	if not grounded:
		velocity.y -= gravity * delta
	else:
		velocity.y = 0.0

	var p := _get_player()
	if not p:
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		move_and_slide()
		return

	var to_p := p.global_position - global_position
	to_p.y = 0.0
	var dist := to_p.length()
	if dist > 0.001:
		var yaw := atan2(to_p.x, to_p.z)
		rotation.y = lerp_angle(rotation.y, yaw, 1.0 - exp(-8.0 * delta))

	# Simple approach + light strafe so it's not a turret.
	var desired := Vector3.ZERO
	if dist > stop_distance:
		desired = to_p.normalized() * move_speed
	else:
		var right := global_transform.basis.x
		right.y = 0.0
		right = right.normalized()
		var s := sin(Time.get_ticks_msec() * 0.001 + float(get_instance_id()) * 0.01)
		desired = right * s * strafe_speed

	velocity.x = move_toward(velocity.x, desired.x, 18.0 * delta) + _impact_impulse.x
	velocity.z = move_toward(velocity.z, desired.z, 18.0 * delta) + _impact_impulse.z
	move_and_slide()
	_grounded_by_height = _snap_to_terrain()
	_update_animation(Vector2(velocity.x, velocity.z).length() > 0.12)

	# Attack: hitscan "return fire".
	if dist <= attack_range and _t_fire <= 0.0:
		_t_fire = fire_cd
		_try_shoot(p)

func _try_shoot(p: Node3D) -> void:
	var from := global_position + Vector3(0, 0.9, 0)
	var to := p.global_position + Vector3(0, 1.0, 0)
	var d := to - from
	if d.length() < 0.01:
		return
	_spawn_hit_spark(from + d.normalized() * 0.22, Color(1.0, 0.72, 0.3), 0.08)
	_spawn_beam(from, to, Color(1.0, 0.6, 0.2))
	if p.has_method("apply_damage"):
		p.call("apply_damage", damage, global_position, false)

func _spawn_beam(a: Vector3, b: Vector3, c: Color) -> void:
	var v := b - a
	var beam_len := v.length()
	if beam_len < 0.01:
		return
	var n := Node3D.new()
	n.name = "EnemyBeam"
	var mi := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.03
	mesh.bottom_radius = 0.03
	mesh.height = beam_len
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	mat.emission = c
	mat.emission_energy_multiplier = 1.2
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(c.r, c.g, c.b, 0.35)
	mi.material_override = mat
	n.add_child(mi)

	var b0 := Basis.looking_at(v.normalized(), Vector3.UP)
	b0 = b0 * Basis(Vector3.RIGHT, deg_to_rad(90.0))
	n.global_transform = Transform3D(b0, a + v * 0.5)

	get_tree().current_scene.add_child(n)
	get_tree().create_timer(0.06).timeout.connect(func(): n.queue_free())

func apply_damage(amount: int, hit_from: Vector3 = Vector3.ZERO, is_heavy: bool = false) -> void:
	if hp <= 0:
		return
	hp = max(0, hp - amount)
	_flash()
	_spawn_hit_spark(global_position + Vector3(0, 0.9, 0), Color(1.0, 0.76, 0.45), 0.18 if is_heavy else 0.12)
	_punch_visual(0.06 if is_heavy else 0.035)
	if hit_from != Vector3.ZERO:
		var away := global_position - hit_from
		away.y = 0.0
		if away.length() > 0.001:
			_impact_impulse += away.normalized() * (1.15 if is_heavy else 0.45)
	_update_label()
	if hp == 0:
		_play_sfx("enemy_death", randf_range(0.96, 1.04), -2.5)
		queue_free()

func _flash() -> void:
	var mat := body.material_override as StandardMaterial3D
	if not mat:
		return
	mat.emission_energy_multiplier = 3.0
	get_tree().create_timer(0.08).timeout.connect(func():
		if mat:
			mat.emission_energy_multiplier = 0.9
	)

func _update_label() -> void:
	label.text = ("TARGET\n" if _targeted else "") + "ENEMY %d/%d" % [hp, max_hp]

func set_targeted(v: bool) -> void:
	_targeted = v

func _make_target_ring() -> void:
	_target_ring = MeshInstance3D.new()
	_target_ring.name = "TargetRing"
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.56
	mesh.outer_radius = 0.62
	mesh.ring_segments = 10
	mesh.rings = 24
	_target_ring.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.25, 1.0, 1.0, 0.3)
	mat.emission_enabled = true
	mat.emission = Color(0.25, 1.0, 1.0)
	mat.emission_energy_multiplier = 1.3
	_target_ring.material_override = mat
	_target_ring.rotation_degrees = Vector3(90.0, 0.0, 0.0)
	_target_ring.position = Vector3(0.0, 0.08, 0.0)
	_target_ring.visible = false
	add_child(_target_ring)

func _update_target_feedback(delta: float) -> void:
	if _target_ring:
		_target_ring.visible = _targeted
		if _targeted:
			var pulse := 1.0 + sin(Time.get_ticks_msec() * 0.01) * 0.08
			_target_ring.scale = Vector3.ONE * pulse
			_target_ring.rotation_degrees.y += 90.0 * delta
	label.modulate = Color(0.7, 1.0, 1.0, 1.0) if _targeted else Color(1.0, 1.0, 1.0, 1.0)
	label.scale = Vector3.ONE * (1.12 if _targeted else 1.0)
	_update_label()

func _get_player() -> Node3D:
	var arr := get_tree().get_nodes_in_group("player")
	if arr.size() > 0 and arr[0] is Node3D:
		return arr[0] as Node3D
	return null

func _setup_animation() -> void:
	_anim_player = _find_animation_player(visual_root)
	if not _anim_player:
		return
	_anim_idle = _pick_animation(_anim_player, ["idle", "survey", "stand"])
	_anim_move = _pick_animation(_anim_player, ["run", "walk"])
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

func _spawn_hit_spark(p: Vector3, color: Color, radius: float) -> void:
	var n := Node3D.new()
	n.name = "EnemyHitSpark"
	var mi := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 1.8
	mat.albedo_color = color
	mi.material_override = mat
	n.add_child(mi)
	get_tree().current_scene.add_child(n)
	n.global_position = p
	get_tree().create_timer(0.08).timeout.connect(func(): n.queue_free())

func _punch_visual(amount: float) -> void:
	var base_scale := Vector3(0.015, 0.015, 0.015)
	visual_root.scale = Vector3(base_scale.x + amount * 0.2, base_scale.y - amount * 0.1, base_scale.z + amount * 0.2)
	var tween := create_tween()
	tween.tween_property(visual_root, "scale", base_scale, 0.12)

func _audio() -> Node:
	return get_tree().get_first_node_in_group("audio_manager")

func _play_sfx(key: String, rate: float = 1.0, volume_db: float = 0.0) -> void:
	var audio := _audio()
	if audio and audio.has_method("play_sfx"):
		audio.call("play_sfx", key, rate, volume_db)

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
	var world := get_parent()
	if world and world.has_method("height_at"):
		return float(world.call("height_at", global_position.x, global_position.z))
	var maybe_world := get_parent().get_parent() if get_parent() else null
	if maybe_world and maybe_world.has_method("height_at"):
		return float(maybe_world.call("height_at", global_position.x, global_position.z))
	return NAN

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
					sm.roughness = maxf(sm.roughness, 0.55)
					sm.metallic = minf(sm.metallic, 0.08)
				mi.set_surface_override_material(surface_idx, tuned)
	for child in root.get_children():
		_apply_visual_style(child, tint)

