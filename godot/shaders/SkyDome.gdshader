shader_type spatial;
render_mode unshaded, cull_front, fog_disabled, depth_draw_never;

uniform vec4 top_color : source_color = vec4(0.658824, 0.847059, 1.0, 1.0);
uniform vec4 mid_color : source_color = vec4(0.415686, 0.619608, 0.784314, 1.0);
uniform vec4 horizon_color : source_color = vec4(0.290196, 0.415686, 0.533333, 1.0);

varying vec3 local_pos;

void vertex() {
	local_pos = VERTEX;
}

void fragment() {
	float h = clamp(normalize(local_pos).y * 0.5 + 0.5, 0.0, 1.0);
	vec3 col = mix(horizon_color.rgb, mid_color.rgb, smoothstep(0.0, 0.38, h));
	col = mix(col, top_color.rgb, smoothstep(0.38, 1.0, h));
	ALBEDO = col;
	ALPHA = 1.0;
}
