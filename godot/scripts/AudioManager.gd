extends Node

const SAMPLE_RATE := 32000
const TAU_F := PI * 2.0

const HUB_CHORDS := [
	[220.0, 261.63, 329.63, 392.0],
	[174.61, 220.0, 261.63, 329.63],
	[164.81, 196.0, 246.94, 293.66],
	[196.0, 233.08, 293.66, 349.23],
]

const FOREST_CHORDS := [
	[146.83, 174.61, 220.0, 261.63],
	[130.81, 155.56, 196.0, 233.08],
	[164.81, 196.0, 246.94, 293.66],
	[110.0, 130.81, 164.81, 196.0],
]

var _music_players: Array[AudioStreamPlayer] = []
var _active_music_idx := 0
var _current_zone := ""
var _music_cache: Dictionary = {}

func _ready() -> void:
	add_to_group("audio_manager")
	_setup_buses()
	_setup_players()
	prime("hub")
	set_zone_music("hub", true)

func prime(zone: String) -> void:
	_current_zone = zone

func set_zone_music(zone: String, immediate: bool = false) -> void:
	var stream := _music_for_zone(zone)
	if not stream or _music_players.is_empty():
		return
	if _current_zone == zone and _music_players[_active_music_idx].playing:
		return

	var next_idx := (_active_music_idx + 1) % 2
	var old_player := _music_players[_active_music_idx]
	var new_player := _music_players[next_idx]
	new_player.stream = stream
	new_player.volume_db = 0.0 if immediate else -30.0
	new_player.play()

	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(new_player, "volume_db", 0.0, 0.9 if not immediate else 0.01)
	tween.tween_property(old_player, "volume_db", -30.0, 0.9 if not immediate else 0.01)
	tween.finished.connect(func():
		if old_player.playing:
			old_player.stop()
	)

	_active_music_idx = next_idx
	_current_zone = zone

func play_sfx(key: String, rate: float = 1.0, volume_db: float = 0.0) -> void:
	var stream := _build_sfx_stream(key, clampf(rate, 0.5, 1.4))
	if not stream:
		return
	_play_one_shot(stream, "SFX", volume_db)

func play_ui(key: String = "ui_click", rate: float = 1.0) -> void:
	var stream := _build_sfx_stream(key, clampf(rate, 0.5, 1.4))
	if not stream:
		return
	_play_one_shot(stream, "UI", -1.5)

func play_footstep_variant(step: int) -> void:
	var key := "footstep_a"
	match posmod(step, 3):
		1:
			key = "footstep_b"
		2:
			key = "footstep_c"
	play_sfx(key, 1.05, -8.0)

func _music_for_zone(zone: String) -> AudioStream:
	var key := "forest1" if zone == "forest" or zone == "forest1" else "hub"
	if _music_cache.has(key):
		return _music_cache[key]
	var stream := _build_music_stream(key)
	_music_cache[key] = stream
	return stream

func _build_music_stream(zone: String) -> AudioStreamWAV:
	var is_hub := zone == "hub"
	var chords := HUB_CHORDS if is_hub else FOREST_CHORDS
	var chord_sec := 5.5 if is_hub else 6.5
	var sub_hz := 55.0 if is_hub else 41.2
	var arp_pattern := [0, 7, 12, 7, 4, 12] if is_hub else [0, 3, 7, 12, 7, 5]
	var arp_root_midi := 64 if is_hub else 55
	var arp_sec := 0.165 if is_hub else 0.21
	var duration_sec := chord_sec * float(chords.size())
	var sample_count := int(duration_sec * SAMPLE_RATE)
	var samples := PackedFloat32Array()
	samples.resize(sample_count)

	var pad_phases := [0.0, 0.0, 0.0, 0.0]
	var sub_phase := 0.0
	var arp_phase := 0.0
	var wind_low := 0.0
	var wind_band := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 7331 if is_hub else 9917

	for i in range(sample_count):
		var t := float(i) / float(SAMPLE_RATE)

		var chord_idx := int(floor(t / chord_sec)) % chords.size()
		var prev_chord_idx := posmod(chord_idx - 1, chords.size())
		var chord_local := fmod(t, chord_sec)
		var chord_blend := _smoothstep(clampf(chord_local / 1.4, 0.0, 1.0))

		var pad := 0.0
		for j in range(4):
			var hz_prev: float = chords[prev_chord_idx][j]
			var hz_now: float = chords[chord_idx][j]
			var hz := lerpf(hz_prev, hz_now, chord_blend)
			pad_phases[j] = fmod(pad_phases[j] + TAU_F * hz / float(SAMPLE_RATE), TAU_F)
			pad += sin(pad_phases[j])
		pad *= 0.14 / 4.0 if is_hub else 0.11 / 4.0

		sub_phase = fmod(sub_phase + TAU_F * sub_hz / float(SAMPLE_RATE), TAU_F)
		var sub := sin(sub_phase) * (0.06 if is_hub else 0.09)

		var arp_step := int(floor(t / arp_sec)) % arp_pattern.size()
		var prev_arp_step := posmod(arp_step - 1, arp_pattern.size())
		var arp_local := fmod(t, arp_sec)
		var arp_blend := _smoothstep(clampf(arp_local / 0.04, 0.0, 1.0))
		var arp_prev_hz := _midi_to_hz(arp_root_midi + arp_pattern[prev_arp_step])
		var arp_hz := lerpf(arp_prev_hz, _midi_to_hz(arp_root_midi + arp_pattern[arp_step]), arp_blend)
		arp_phase = fmod(arp_phase + TAU_F * arp_hz / float(SAMPLE_RATE), TAU_F)
		var arp_env := exp(-arp_local * 14.0)
		var arp := _triangle_wave(arp_phase) * arp_env * (0.045 if is_hub else 0.032)

		var wind := 0.0
		if not is_hub:
			var white := rng.randf_range(-1.0, 1.0)
			wind_low += (white - wind_low) * 0.002
			var high := white - wind_low
			wind_band += (high - wind_band) * 0.02
			var wobble := 320.0 + sin(t * 0.44) * 220.0 + sin(t * 0.75) * 90.0
			var wind_amp := 0.02 + ((sin(t * 0.7) + 1.0) * 0.5) * 0.035
			wind = wind_band * wind_amp * (0.7 + 0.3 * sin(t * wobble * 0.002))

		samples[i] = tanh((pad + sub + arp + wind) * 1.6) * 0.7

	return _make_wav_stream(samples, SAMPLE_RATE)

func _build_sfx_stream(key: String, rate: float) -> AudioStreamWAV:
	var duration := 0.1
	match key:
		"ui_click":
			duration = 0.06
		"teleport":
			duration = 0.7
		"lock_on":
			duration = 0.18
		"melee_combo_a":
			duration = 0.1
		"melee_combo_b":
			duration = 0.09
		"melee_impact":
			duration = 0.13
		"melee_heavy":
			duration = 0.25
		"tech_cast":
			duration = 0.4
		"tech_heal":
			duration = 0.55
		"wave_complete":
			duration = 0.52
		"enemy_death":
			duration = 0.32
		"player_hurt":
			duration = 0.16
		"footstep_a", "footstep_b", "footstep_c":
			duration = 0.05
		_:
			return null

	var sample_count := int(duration * SAMPLE_RATE)
	var samples := PackedFloat32Array()
	samples.resize(sample_count)
	var rng := RandomNumberGenerator.new()
	rng.seed = key.hash() + int(rate * 1000.0)

	match key:
		"ui_click":
			_add_tone(samples, "sine", 3200.0 * rate, 0.0, 0.0, 0.004, 0.045, 0.12)
		"teleport":
			_add_chirp(samples, "sine", 120.0 * rate, 2400.0 * rate, 0.0, 0.65, 0.04, 0.22)
			_add_noise_burst(samples, rng, 0.0, 0.35, 0.08, 800.0 * rate)
		"lock_on":
			_add_tone(samples, "square", 880.0 * rate, 0.0, 0.0, 0.003, 0.07, 0.06)
			_add_tone(samples, "square", 1180.0 * rate, 0.09, 0.0, 0.003, 0.07, 0.06)
		"melee_combo_a":
			_add_noise_burst(samples, rng, 0.0, 0.07, 0.14, 420.0 * rate)
			_add_tone(samples, "saw", 180.0 * rate, 0.0, 0.0, 0.002, 0.09, 0.08)
		"melee_combo_b":
			_add_noise_burst(samples, rng, 0.0, 0.06, 0.12, 520.0 * rate)
			_add_tone(samples, "square", 240.0 * rate, 0.0, 0.0, 0.002, 0.08, 0.07)
		"melee_impact":
			_add_noise_burst(samples, rng, 0.0, 0.05, 0.18, 380.0 * rate)
			_add_tone(samples, "sine", 90.0 * rate, 0.0, 0.0, 0.002, 0.12, 0.2)
		"melee_heavy":
			_add_noise_burst(samples, rng, 0.0, 0.12, 0.16, 200.0 * rate)
			_add_chirp(samples, "saw", 55.0 * rate, 35.0 * rate, 0.0, 0.22, 0.002, 0.16)
		"tech_cast":
			_add_fm_tone(samples, 400.0 * rate, 6.0, 80.0 * rate, 0.0, 0.35, 0.05, 0.14)
		"tech_heal":
			var notes := [523.25, 659.25, 783.99, 1046.5]
			for i in range(notes.size()):
				_add_tone(samples, "sine", notes[i] * rate * 0.5, float(i) * 0.055, 0.0, 0.02, 0.35, 0.09)
		"wave_complete":
			var scale := [392.0, 493.88, 523.25, 659.25, 783.99]
			for i in range(scale.size()):
				_add_tone(samples, "triangle", scale[i] * rate, float(i) * 0.045, 0.0, 0.02, 0.28, 0.07)
		"enemy_death":
			_add_chirp(samples, "saw", 400.0 * rate, 60.0 * rate, 0.0, 0.3, 0.0, 0.1)
			_add_noise_burst(samples, rng, 0.0, 0.2, 0.1, 600.0 * rate)
		"player_hurt":
			_add_tone(samples, "square", 145.0 * rate, 0.0, 0.0, 0.0, 0.15, 0.055)
			_add_tone(samples, "square", 123.0 * rate, 0.0, 0.0, 0.0, 0.15, 0.045)
			_add_noise_burst(samples, rng, 0.0, 0.04, 0.08, 700.0 * rate)
		"footstep_a":
			_add_noise_burst(samples, rng, 0.0, 0.038, 0.045, 180.0)
		"footstep_b":
			_add_noise_burst(samples, rng, 0.0, 0.038, 0.053, 215.0)
		"footstep_c":
			_add_noise_burst(samples, rng, 0.0, 0.038, 0.061, 250.0)

	for i in range(sample_count):
		samples[i] = tanh(samples[i] * 1.35) * 0.85

	return _make_wav_stream(samples, SAMPLE_RATE)

func _play_one_shot(stream: AudioStream, bus: String, volume_db: float) -> void:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.bus = bus
	p.volume_db = volume_db
	add_child(p)
	p.finished.connect(func(): p.queue_free())
	p.play()

func _setup_players() -> void:
	for i in range(2):
		var p := AudioStreamPlayer.new()
		p.name = "MusicPlayer%d" % i
		p.bus = "Music"
		p.volume_db = -30.0
		p.finished.connect(func():
			if p == _music_players[_active_music_idx] and p.stream:
				p.play()
		)
		add_child(p)
		_music_players.append(p)

func _setup_buses() -> void:
	_ensure_bus("Music")
	_ensure_bus("SFX")
	_ensure_bus("UI")

func _ensure_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) != -1:
		return
	var idx := AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, bus_name)

func _midi_to_hz(m: int) -> float:
	return 440.0 * pow(2.0, (float(m) - 69.0) / 12.0)

func _smoothstep(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)

func _triangle_wave(phase: float) -> float:
	return (2.0 / PI) * asin(sin(phase))

func _square_wave(phase: float) -> float:
	return 1.0 if sin(phase) >= 0.0 else -1.0

func _saw_wave(phase: float) -> float:
	var x := fmod(phase / TAU_F, 1.0)
	return x * 2.0 - 1.0

func _wave_sample(wave: String, phase: float) -> float:
	match wave:
		"square":
			return _square_wave(phase)
		"saw":
			return _saw_wave(phase)
		"triangle":
			return _triangle_wave(phase)
		_:
			return sin(phase)

func _amp_envelope(local_t: float, attack: float, decay: float) -> float:
	if local_t < 0.0 or local_t > decay:
		return 0.0
	if local_t < attack:
		return local_t / maxf(attack, 0.0001)
	return exp(-(local_t - attack) * 18.0 / maxf(decay - attack, 0.0001))

func _add_tone(samples: PackedFloat32Array, wave: String, hz: float, start_t: float, _unused: float, attack: float, decay: float, gain: float) -> void:
	var start_idx := int(start_t * SAMPLE_RATE)
	var end_idx := mini(samples.size(), int((start_t + decay + 0.04) * SAMPLE_RATE))
	var phase := 0.0
	for i in range(start_idx, end_idx):
		var local_t := (float(i) / float(SAMPLE_RATE)) - start_t
		var env := _amp_envelope(local_t, attack, decay)
		phase = fmod(phase + TAU_F * hz / float(SAMPLE_RATE), TAU_F)
		samples[i] += _wave_sample(wave, phase) * env * gain

func _add_chirp(samples: PackedFloat32Array, wave: String, hz_start: float, hz_end: float, start_t: float, decay: float, attack: float, gain: float) -> void:
	var start_idx := int(start_t * SAMPLE_RATE)
	var end_idx := mini(samples.size(), int((start_t + decay + 0.05) * SAMPLE_RATE))
	var phase := 0.0
	for i in range(start_idx, end_idx):
		var local_t := (float(i) / float(SAMPLE_RATE)) - start_t
		var env := _amp_envelope(local_t, attack, decay)
		var prog := clampf(local_t / maxf(decay, 0.0001), 0.0, 1.0)
		var hz := exp(lerpf(log(maxf(hz_start, 1.0)), log(maxf(hz_end, 1.0)), prog))
		phase = fmod(phase + TAU_F * hz / float(SAMPLE_RATE), TAU_F)
		samples[i] += _wave_sample(wave, phase) * env * gain

func _add_fm_tone(samples: PackedFloat32Array, carrier_hz: float, mod_hz: float, mod_depth: float, start_t: float, decay: float, attack: float, gain: float) -> void:
	var start_idx := int(start_t * SAMPLE_RATE)
	var end_idx := mini(samples.size(), int((start_t + decay + 0.05) * SAMPLE_RATE))
	var car_phase := 0.0
	var mod_phase := 0.0
	for i in range(start_idx, end_idx):
		var local_t := (float(i) / float(SAMPLE_RATE)) - start_t
		var env := _amp_envelope(local_t, attack, decay)
		mod_phase = fmod(mod_phase + TAU_F * mod_hz / float(SAMPLE_RATE), TAU_F)
		car_phase = fmod(car_phase + TAU_F * carrier_hz / float(SAMPLE_RATE), TAU_F)
		samples[i] += sin(car_phase + sin(mod_phase) * (mod_depth / maxf(carrier_hz, 1.0))) * env * gain

func _add_noise_burst(samples: PackedFloat32Array, rng: RandomNumberGenerator, start_t: float, duration: float, gain: float, filter_hz: float) -> void:
	var start_idx := int(start_t * SAMPLE_RATE)
	var end_idx := mini(samples.size(), int((start_t + duration) * SAMPLE_RATE))
	var low := 0.0
	var band := 0.0
	var coeff := clampf(filter_hz / float(SAMPLE_RATE), 0.001, 0.25)
	for i in range(start_idx, end_idx):
		var local_t := (float(i) / float(SAMPLE_RATE)) - start_t
		var env := 1.0 - clampf(local_t / maxf(duration, 0.0001), 0.0, 1.0)
		var white := rng.randf_range(-1.0, 1.0)
		low += (white - low) * coeff * 0.5
		var high := white - low
		band += (high - band) * coeff * 2.0
		samples[i] += band * env * gain

func _make_wav_stream(samples: PackedFloat32Array, sample_rate: int) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	var di := 0
	for s in samples:
		var v := clampf(s, -1.0, 1.0)
		var sample_i := int(round(v * 32767.0))
		if sample_i < 0:
			sample_i += 65536
		data[di] = sample_i & 0xFF
		data[di + 1] = (sample_i >> 8) & 0xFF
		di += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = sample_rate
	wav.stereo = false
	wav.data = data
	return wav
