#version 300 es

precision highp float;


uniform float u_EnvBlurNormalized;
uniform int u_MipCount;
uniform samplerCube u_GGXEnvSampler;

in vec3 v_TexCoords;

out vec4 FragColor;


vec3 toneMap(vec3 color) {
    return pow(color, vec3(1.0/2.2));
}

void main() {
    vec4 color = textureLod(u_GGXEnvSampler, v_TexCoords, u_EnvBlurNormalized * float(u_MipCount - 1));

    FragColor = vec4(toneMap(color.rgb), 1);
}
