extends Node3D

@export_enum("hub", "forest1") var zone := "hub"

const TERRAIN_SIZE := 180.0
const TERRAIN_SEGMENTS := 180
const PLAZA_CENTER := Vector2(-8.0, 6.0)
const PLAZA_RADIUS := 13.0
const HUB_SPAWN := Vector2(-7.0, 6.0)
const HUB_TELEPIPE := Vector2(-13.0, 8.0)
const NPC_POS := Vector2(-4.5, 5.4)
const SHELL_POSITIONS := [
	Vector2(-9.8, 4.6),
	Vector2(-5.6, 11.1),
	Vector2(-1.9, 7.2),
	Vector2(-13.5, 2.5),
	Vector2(-6.2, 0.6),
]
const MISSION_ORIGIN := Vector2(0.0, 88.0)
const MISSION_SPAWN_Z_OFS := 5.25
const MISSION_EXIT_Z_OFS := -6.5
const TREE_COUNT := 180

const SOLDIER_SCENE := preload("res://assets/models/Soldier.glb")
const RIFLE_SCENE := preload("res://assets/models/weapon_rifle.glb")
const SHELL_SCENE := preload("res://assets/models/rocks_smallA.glb")
const PILLAR_SCENE := preload("res://assets/models/stone_tallA.glb")
const SKY_SHADER := preload("res://shaders/SkyDome.gdshader")
const TREE_SCENES := [
	preload("res://assets/models/tree_pineTallA.glb"),
	preload("res://assets/models/tree_pineRoundC.glb"),
	preload("res://assets/models/tree_small.glb"),
	preload("res://assets/models/tree_tall.glb"),
	preload("res://assets/models/tree_thin.glb"),
	preload("res://assets/models/tree_detailed.glb"),
]

@onready var floor_visual: MeshInstance3D = $Floor
@onready var floor_body: StaticBody3D = $FloorBody
@onready var floor_collision: CollisionShape3D = $FloorBody/CollisionShape3D
@onready var spawn_node: Node3D = $Spawn
@onready var telepipe: Area3D = $Telepipe
@onready var telepipe_ring: MeshInstance3D = $Telepipe/Ring

var generated_root: Node3D

func _ready() -> void:
	generated_root = Node3D.new()
	generated_root.name = "Generated"
	add_child(generated_root)

	floor_visual.position = Vector3.ZERO
	floor_body.position = Vector3.ZERO

	_add_sky_dome()
	_build_terrain()
	_configure_zone_nodes()
	_add_plaza_ring()
	_add_hub_lights()
	_add_npc()
	_add_shells()
	_add_pillars()
	_add_trees()

func get_spawn_position() -> Vector3:
	if zone == "forest1":
		var forest_z: float = MISSION_ORIGIN.y + MISSION_SPAWN_Z_OFS
		return Vector3(MISSION_ORIGIN.x, height_at(MISSION_ORIGIN.x, forest_z), forest_z)
	return Vector3(HUB_SPAWN.x, height_at(HUB_SPAWN.x, HUB_SPAWN.y), HUB_SPAWN.y)

func get_telepipe_position() -> Vector3:
	if zone == "forest1":
		var forest_exit_z: float = MISSION_ORIGIN.y + MISSION_EXIT_Z_OFS
		return Vector3(MISSION_ORIGIN.x, height_at(MISSION_ORIGIN.x, forest_exit_z), forest_exit_z)
	return Vector3(HUB_TELEPIPE.x, height_at(HUB_TELEPIPE.x, HUB_TELEPIPE.y), HUB_TELEPIPE.y)

func height_at(x: float, z: float) -> float:
	var n: float = _fbm((x + 1000.0) * 0.04, (z + 1000.0) * 0.04)
	var h: float = (n - 0.5) * 3.4
	var creek_z: float = -20.0 + sin((x + 10.0) * 0.06) * 5.0
	var creek_dist: float = abs(z - creek_z)
	var valley: float = _smoothstep_range(creek_dist, 0.0, 10.0)
	h -= valley * 1.8

	var d: float = Vector2(x - PLAZA_CENTER.x, z - PLAZA_CENTER.y).length()
	var t: float = clamp((d - (PLAZA_RADIUS - 2.0)) / 4.0, 0.0, 1.0)
	var flatten: float = 1.0 - _smoothstep01(t)
	h = h * (1.0 - flatten) + 0.25 * flatten

	if z > 50.0:
		var forest_slope: float = clamp((z - 50.0) / 50.0, 0.0, 1.0)
		h += forest_slope * 2.2
	return h

func _build_terrain() -> void:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	var heights := PackedFloat32Array()
	var stride: int = TERRAIN_SEGMENTS + 1
	var half_size: float = TERRAIN_SIZE * 0.5

	for z_idx in range(stride):
		var zf: float = lerpf(-half_size, half_size, float(z_idx) / float(TERRAIN_SEGMENTS))
		for x_idx in range(stride):
			var xf: float = lerpf(-half_size, half_size, float(x_idx) / float(TERRAIN_SEGMENTS))
			var yf: float = height_at(xf, zf)
			verts.append(Vector3(xf, yf, zf))
			heights.append(yf)
			normals.append(_terrain_normal(xf, zf))
			colors.append(_terrain_color(xf, yf, zf))

	for z_idx in range(TERRAIN_SEGMENTS):
		for x_idx in range(TERRAIN_SEGMENTS):
			var i0: int = z_idx * stride + x_idx
			var i1: int = i0 + 1
			var i2: int = i0 + stride
			var i3: int = i2 + 1
			indices.append_array([i0, i2, i1, i1, i2, i3])

	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices

	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	floor_visual.mesh = mesh

	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	mat.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	mat.specular_mode = BaseMaterial3D.SPECULAR_TOON
	mat.metallic = 0.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	floor_visual.material_override = mat

	var shape := HeightMapShape3D.new()
	shape.map_width = stride
	shape.map_depth = stride
	shape.map_data = heights
	floor_collision.shape = shape
	floor_collision.position = Vector3(-half_size, 0.0, -half_size)

func _configure_zone_nodes() -> void:
	spawn_node.position = get_spawn_position()
	telepipe.position = get_telepipe_position()
	telepipe_ring.position = Vector3(0.0, 0.05, 0.0)
	_apply_import_style(telepipe, Color(0.94, 0.98, 1.04, 1.0), Color(0.12, 0.72, 0.8, 1.0), 0.2)
	_add_telepipe_label()

func _add_telepipe_label() -> void:
	if telepipe.get_node_or_null("TelepipeLabel"):
		return
	var label := Label3D.new()
	label.name = "TelepipeLabel"
	label.text = "TELEPIPE"
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size = 0.01
	label.modulate = Color(0.85, 0.97, 1.0, 1.0)
	label.outline_modulate = Color(0.08, 0.16, 0.22, 0.95)
	label.position = Vector3(0.0, 3.45, 0.0)
	telepipe.add_child(label)

func _add_sky_dome() -> void:
	var sky := MeshInstance3D.new()
	sky.name = "SkyDome"
	var mesh := SphereMesh.new()
	mesh.radius = 260.0
	mesh.height = 520.0
	mesh.radial_segments = 48
	mesh.rings = 24
	sky.mesh = mesh

	var mat := ShaderMaterial.new()
	mat.shader = SKY_SHADER
	if zone == "forest1":
		mat.set_shader_parameter("top_color", Color(0.039216, 0.101961, 0.070588, 1.0))
		mat.set_shader_parameter("mid_color", Color(0.101961, 0.239216, 0.164706, 1.0))
		mat.set_shader_parameter("horizon_color", Color(0.176471, 0.352941, 0.282353, 1.0))
	else:
		mat.set_shader_parameter("top_color", Color(0.658824, 0.847059, 1.0, 1.0))
		mat.set_shader_parameter("mid_color", Color(0.415686, 0.619608, 0.784314, 1.0))
		mat.set_shader_parameter("horizon_color", Color(0.290196, 0.415686, 0.533333, 1.0))
	sky.material_override = mat
	sky.position = Vector3(0.0, 40.0, 0.0)
	generated_root.add_child(sky)

func _add_plaza_ring() -> void:
	var plaza_ring := MeshInstance3D.new()
	plaza_ring.name = "PlazaRing"
	var mesh := TorusMesh.new()
	mesh.inner_radius = 15.38
	mesh.outer_radius = 15.62
	mesh.ring_segments = 8
	mesh.rings = 64
	plaza_ring.mesh = mesh

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.227, 0.29, 0.384, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(0.063, 0.125, 0.188, 1.0)
	mat.emission_energy_multiplier = 0.12
	mat.roughness = 1.0
	mat.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	mat.specular_mode = BaseMaterial3D.SPECULAR_TOON
	plaza_ring.material_override = mat
	plaza_ring.rotation_degrees = Vector3(90.0, 0.0, 0.0)
	plaza_ring.position = Vector3(PLAZA_CENTER.x, height_at(PLAZA_CENTER.x, PLAZA_CENTER.y) + 0.04, PLAZA_CENTER.y)
	generated_root.add_child(plaza_ring)

func _add_hub_lights() -> void:
	var portal_light := OmniLight3D.new()
	portal_light.name = "PortalLight"
	portal_light.light_color = Color(0.267, 0.933, 1.0, 1.0) if zone != "forest1" else Color(0.4, 1.0, 0.8, 1.0)
	portal_light.light_energy = 1.25 if zone != "forest1" else 0.35
	portal_light.omni_range = 38.0
	portal_light.position = Vector3(HUB_TELEPIPE.x, 4.2, HUB_TELEPIPE.y)
	generated_root.add_child(portal_light)

	var plaza_light := OmniLight3D.new()
	plaza_light.name = "PlazaAccent"
	plaza_light.light_color = Color(0.667, 0.8, 1.0, 1.0)
	plaza_light.light_energy = 0.45 if zone != "forest1" else 0.08
	plaza_light.omni_range = 28.0
	plaza_light.position = Vector3(PLAZA_CENTER.x, 3.5, PLAZA_CENTER.y)
	generated_root.add_child(plaza_light)

func _add_npc() -> void:
	var npc := (SOLDIER_SCENE.instantiate() as Node3D)
	npc.name = "GuildClerk"
	npc.position = Vector3(NPC_POS.x, height_at(NPC_POS.x, NPC_POS.y), NPC_POS.y)
	npc.rotation.y = PI + PI * 0.12
	npc.scale = Vector3(0.63, 0.63, 0.63)
	_apply_import_style(npc, Color(1.0, 1.0, 1.0, 1.0), Color(0.0, 0.0, 0.0, 1.0), 0.0)

	var rifle := (RIFLE_SCENE.instantiate() as Node3D)
	rifle.position = Vector3(0.08, 0.95, -0.28)
	rifle.rotation.y = PI * 0.48
	rifle.scale = Vector3(0.9, 0.9, 0.9)
	_apply_import_style(rifle, Color(0.95, 0.97, 1.02, 1.0), Color(0.0, 0.0, 0.0, 1.0), 0.0)
	npc.add_child(rifle)

	var label := Label3D.new()
	label.name = "Nameplate"
	label.text = "GUILD CLERK"
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size = 0.008
	label.modulate = Color(0.9, 0.96, 1.0, 1.0)
	label.position = Vector3(0.0, 2.05, 0.0)
	npc.add_child(label)

	generated_root.add_child(npc)

func _add_shells() -> void:
	for i in range(SHELL_POSITIONS.size()):
		var p: Vector2 = SHELL_POSITIONS[i]
		var shell := (SHELL_SCENE.instantiate() as Node3D)
		shell.name = "Shell%d" % i
		shell.position = Vector3(p.x, height_at(p.x, p.y) + 0.12, p.y)
		shell.scale = Vector3(1.35, 1.35, 1.35)
		_apply_import_style(shell, Color(0.5, 0.92, 1.02, 1.0), Color(0.16, 0.4, 0.52, 1.0), 0.28)
		generated_root.add_child(shell)

func _add_pillars() -> void:
	var mz := 86.0
	for i in range(-5, 6):
		var x: float = float(i) * 2.3
		_add_pillar_at(Vector3(x, height_at(x, mz + 11.0) + 0.2, mz + 11.0), "PillarFront%d" % i)
		_add_pillar_at(Vector3(x, height_at(x, mz - 11.0) + 0.2, mz - 11.0), "PillarBack%d" % i)

func _add_pillar_at(pos: Vector3, node_name: String) -> void:
	var pillar := (PILLAR_SCENE.instantiate() as Node3D)
	pillar.name = node_name
	pillar.position = pos
	pillar.scale = Vector3(1.05, 1.05, 1.05)
	_apply_import_style(pillar, Color(1.0, 1.0, 1.0, 1.0), Color(0.0, 0.0, 0.0, 1.0), 0.0)
	generated_root.add_child(pillar)

func _add_trees() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1337

	for i in range(TREE_COUNT):
		var x: float = rng.randf_range(-75.0, 75.0)
		var z: float = rng.randf_range(-75.0, 75.0)
		if Vector2(x - PLAZA_CENTER.x, z - PLAZA_CENTER.y).length() < 24.0:
			continue
		var tree := _clone_tree(float(i) * 13.37)
		tree.name = "Tree%d" % i
		tree.position = Vector3(x, height_at(x, z), z)
		var tint_scale := 0.88 if z > 50.0 else 1.0
		_apply_import_style(tree, Color(tint_scale, tint_scale, tint_scale, 1.0), Color(0.0, 0.0, 0.0, 1.0), 0.0)
		generated_root.add_child(tree)

func _clone_tree(seed_value: float) -> Node3D:
	var idx: int = int(floor(_rand01(seed_value + 1.0) * float(TREE_SCENES.size()))) % TREE_SCENES.size()
	var tree_scene := TREE_SCENES[idx] as PackedScene
	var tree := tree_scene.instantiate() as Node3D
	var s: float = 0.82 + _rand01(seed_value + 2.0) * 0.38
	tree.rotation.y = _rand01(seed_value) * TAU
	tree.scale = Vector3(s, s, s)
	return tree

func _apply_import_style(root: Node, tint: Color, emissive: Color, emissive_energy: float) -> void:
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
					if emissive_energy > 0.0:
						sm.emission_enabled = true
						sm.emission = emissive
						sm.emission_energy_multiplier = maxf(sm.emission_energy_multiplier, emissive_energy)
				mi.set_surface_override_material(surface_idx, tuned)
	for child in root.get_children():
		_apply_import_style(child, tint, emissive, emissive_energy)

func _terrain_normal(x: float, z: float) -> Vector3:
	var eps := 0.35
	var hx0: float = height_at(x - eps, z)
	var hx1: float = height_at(x + eps, z)
	var hz0: float = height_at(x, z - eps)
	var hz1: float = height_at(x, z + eps)
	return Vector3(hx0 - hx1, eps * 2.0, hz0 - hz1).normalized()

func _terrain_color(x: float, y: float, z: float) -> Color:
	var creek_z: float = -20.0 + sin((x + 10.0) * 0.06) * 5.0
	var creek_dist: float = abs(z - creek_z)
	var near_creek: float = clamp(1.0 - creek_dist / 6.0, 0.0, 1.0)
	var h_norm: float = clamp((y + 2.5) / 6.0, 0.0, 1.0)
	var grass: Color = _color_from_hsl(0.31, 0.58, 0.30)
	var dirt: Color = _color_from_hsl(0.09, 0.50, 0.24)
	var stone: Color = _color_from_hsl(0.58, 0.10, 0.44)
	var plaza_tile: Color = _color_from_hsl(0.56, 0.14, 0.42)

	var c: Color = grass.lerp(dirt, near_creek * 0.55)
	c = c.lerp(stone, pow(h_norm, 2.2) * 0.35)
	var plaza_dist: float = Vector2(x + 8.0, z - 6.0).length()
	if plaza_dist < 14.0:
		c = c.lerp(plaza_tile, (1.0 - plaza_dist / 14.0) * 0.62)
	return c

func _color_from_hsl(h: float, s: float, l: float) -> Color:
	if s <= 0.0001:
		return Color(l, l, l, 1.0)

	var q: float = l * (1.0 + s) if l < 0.5 else l + s - l * s
	var p: float = 2.0 * l - q
	return Color(
		_hue_to_rgb(p, q, h + 1.0 / 3.0),
		_hue_to_rgb(p, q, h),
		_hue_to_rgb(p, q, h - 1.0 / 3.0),
		1.0
	)

func _hue_to_rgb(p: float, q: float, t: float) -> float:
	var tt: float = t
	if tt < 0.0:
		tt += 1.0
	if tt > 1.0:
		tt -= 1.0
	if tt < 1.0 / 6.0:
		return p + (q - p) * 6.0 * tt
	if tt < 1.0 / 2.0:
		return q
	if tt < 2.0 / 3.0:
		return p + (q - p) * (2.0 / 3.0 - tt) * 6.0
	return p

func _fbm(x: float, z: float) -> float:
	var amp := 1.0
	var freq := 1.0
	var sum := 0.0
	var norm := 0.0
	for _i in range(4):
		sum += _value_noise2(x * freq, z * freq) * amp
		norm += amp
		amp *= 0.5
		freq *= 2.0
	return sum / maxf(norm, 0.001)

func _value_noise2(x: float, z: float) -> float:
	var x0: float = floor(x)
	var z0: float = floor(z)
	var x1: float = x0 + 1.0
	var z1: float = z0 + 1.0
	var sx: float = _smoothstep01(x - x0)
	var sz: float = _smoothstep01(z - z0)
	var n00: float = _hash2(x0, z0)
	var n10: float = _hash2(x1, z0)
	var n01: float = _hash2(x0, z1)
	var n11: float = _hash2(x1, z1)
	var ix0: float = lerpf(n00, n10, sx)
	var ix1: float = lerpf(n01, n11, sx)
	return lerpf(ix0, ix1, sz)

func _hash2(x: float, z: float) -> float:
	var s: float = sin(x * 127.1 + z * 311.7) * 43758.5453123
	return s - floor(s)

func _rand01(seed_value: float) -> float:
	var s: float = sin(seed_value * 127.1) * 43758.5453123
	return s - floor(s)

func _smoothstep01(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)

func _smoothstep_range(x: float, edge0: float, edge1: float) -> float:
	var t: float = clamp((x - edge0) / maxf(edge1 - edge0, 0.0001), 0.0, 1.0)
	return _smoothstep01(t)
