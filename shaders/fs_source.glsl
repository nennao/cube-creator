#version 300 es

precision highp float;

uniform float u_Opacity;
uniform vec3 u_ViewPosition;

uniform samplerCube u_GGXEnvSampler;

in vec3 v_Color;
in vec3 v_Normal;
in vec3 v_FragPosition;

out vec4 fragColor;


const float GAMMA = 2.2;
const float INV_GAMMA = 1.0 / GAMMA;

vec3 linearTosRGB(vec3 color) {
    return pow(color, vec3(INV_GAMMA));
}


void main() {
    vec3 normal = v_Normal;

    vec3 directionalLightVector1 = vec3(0, 0, 1);
    vec3 directionalLightColor1 = vec3(1, 1, 1);
    float directionalLightStrength1 = 0.7;

    // reflection
    vec3 viewDir = normalize(u_ViewPosition - v_FragPosition);
    vec3 reflectVector = reflect(-viewDir, normalize(normal));

    vec3 reflection = textureLod(u_GGXEnvSampler, reflectVector, 0.0).rgb;
    vec3 someReflection = 0.25 * reflection;

    // ambient
    vec3 ambient = vec3(0.3);

    // diffuse
    float NdotL1 = max(dot(normal, directionalLightVector1), 0.0);
    vec3 diffuse = (directionalLightStrength1 * directionalLightColor1 * NdotL1);

    vec3 lighting = ambient + diffuse;

    vec3 finalColor = lighting * v_Color + someReflection;


    fragColor = vec4(finalColor, u_Opacity);
}
