extends Node

signal wave_changed(wave: int, remaining: int)
signal all_waves_cleared()

const MISSION_ORIGIN := Vector3(0.0, 0.0, 88.0)

@export var enemy_scene: PackedScene
@export var enemies_path: NodePath = NodePath("../Enemies")
@export var wave_tuning: Resource

@export var waves: Array[int] = [2, 3, 4]

var wave_index := 0
var remaining := 0
var active := false

func _ready() -> void:
	if wave_tuning:
		var raw: Variant = wave_tuning.get("counts")
		if raw is Array:
			waves = (raw as Array).duplicate()
	# Autostart when placed in Forest scene, but defer so the parent (Game)
	# can connect to signals before we emit initial wave_changed.
	call_deferred("start")

func start() -> void:
	active = true
	wave_index = 0
	_start_wave()

func stop() -> void:
	active = false

func get_status() -> Dictionary:
	return {
		"active": active,
		"wave": wave_index + 1,
		"waves_total": waves.size(),
		"remaining": remaining,
		"cleared": active and remaining == 0 and wave_index >= waves.size(),
	}

func _start_wave() -> void:
	if not active:
		return

	if wave_index >= waves.size():
		remaining = 0
		emit_signal("wave_changed", wave_index, remaining)
		emit_signal("all_waves_cleared")
		return

	var enemies := get_node_or_null(enemies_path) as Node3D
	if not enemies:
		# If missing, consider cleared to unblock.
		wave_index = waves.size()
		remaining = 0
		emit_signal("all_waves_cleared")
		return

	# Clear any existing enemies (safety).
	for c in enemies.get_children():
		c.queue_free()

	var count := int(waves[wave_index])
	remaining = count
	emit_signal("wave_changed", wave_index + 1, remaining)

	for i in range(count):
		var e := enemy_scene.instantiate() as Node3D
		e.name = "EnemyW%d_%d" % [wave_index + 1, i + 1]
		var x := MISSION_ORIGIN.x + randf_range(-6.5, 6.5)
		var z := MISSION_ORIGIN.z + randf_range(-3.5, 6.5)
		var y := 0.0
		var world := get_parent()
		if world and world.has_method("height_at"):
			y = float(world.call("height_at", x, z))
		e.position = Vector3(x, y, z)
		enemies.add_child(e)
		e.tree_exited.connect(_on_enemy_exited)

func _on_enemy_exited() -> void:
	if not active:
		return
	remaining = maxi(0, remaining - 1)
	emit_signal("wave_changed", wave_index + 1, remaining)
	if remaining == 0:
		wave_index += 1
		_start_wave()

