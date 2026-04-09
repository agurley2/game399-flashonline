extends Node3D

@export var max_hp := 60
@export var hp := 60

@export var hit_flash_time := 0.12

@onready var body: MeshInstance3D = $Body
@onready var label: Label3D = $Label3D

var _flash_t := 0.0
var _base_emission := 0.9

func _ready() -> void:
	hp = clampi(hp, 0, max_hp)
	_update_label()

	var mat := body.material_override as StandardMaterial3D
	if mat:
		_base_emission = mat.emission_energy_multiplier

func _process(delta: float) -> void:
	if _flash_t > 0.0:
		_flash_t = maxf(0.0, _flash_t - delta)
		var mat := body.material_override as StandardMaterial3D
		if mat:
			# Ease back to base emission.
			var a := _flash_t / hit_flash_time
			mat.emission_energy_multiplier = lerpf(_base_emission, _base_emission * 3.0, a)

func apply_damage(amount: int) -> void:
	if hp <= 0:
		return
	hp = max(0, hp - amount)
	_flash_t = hit_flash_time
	_update_label()
	if hp == 0:
		queue_free()

func _update_label() -> void:
	label.text = "ENEMY %d/%d" % [hp, max_hp]

