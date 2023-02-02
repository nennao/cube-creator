#version 300 es

precision highp float;

uniform float u_Opacity;

in vec3 v_Color;

out vec4 fragColor;


void main() {
    fragColor = vec4(v_Color, u_Opacity);
}
