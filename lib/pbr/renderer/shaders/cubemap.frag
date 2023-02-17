#version 300 es

precision highp float;

const float GAMMA = 2.2;
const float INV_GAMMA = 1.0 / GAMMA;

uniform float u_EnvBlurNormalized;
uniform int u_MipCount;
uniform samplerCube u_GGXEnvSampler;

in vec3 v_TexCoords;

out vec4 FragColor;

vec3 linearTosRGB(vec3 color) {
    return pow(color, vec3(INV_GAMMA));
}


void main() {
    vec4 color = textureLod(u_GGXEnvSampler, v_TexCoords, u_EnvBlurNormalized * float(u_MipCount - 1));

    FragColor = vec4(linearTosRGB(color.rgb), 1);
//
//    FragColor = vec4(v_TexCoords*0.5+0.5, 1);
}
