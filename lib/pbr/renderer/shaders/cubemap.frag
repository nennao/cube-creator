#version 300 es

precision highp float;


uniform float u_EnvBlurNormalized;
uniform int u_MipCount;
uniform samplerCube u_GGXEnvSampler;

uniform vec3 u_EnvColor;

in vec3 v_TexCoords;

out vec4 FragColor;


vec3 toneMap(vec3 color) {
    return pow(color, vec3(1.0/2.2));
}


vec3 desaturate(vec3 color) {
    float greyF = 0.75;
    float grey = color.g*0.59 + color.r*0.3 + color.b*0.11;
    return mix(color, vec3(grey), greyF);
}

vec3 colorLighting(vec3 color) {
    float strength = 0.5;
    return color * (1.0+strength*(u_EnvColor - vec3(0.5)));
}


void main() {
    vec4 color = textureLod(u_GGXEnvSampler, v_TexCoords, u_EnvBlurNormalized * float(u_MipCount - 1));

    vec3 finalColor = colorLighting(desaturate(color.rgb));

    FragColor = vec4(toneMap(finalColor), 1);
}
