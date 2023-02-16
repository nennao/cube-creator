#version 300 es

precision highp float;

uniform float u_Opacity;

in vec3 v_Color;
in vec3 v_Normal;

out vec4 fragColor;


void main() {
    vec3 normal = v_Normal;

    vec3 directionalLightVector1 = vec3(0, 0, 1);
    vec3 directionalLightColor1 = vec3(1, 1, 1);
    float directionalLightStrength1 = 0.7;

    // ambient
    vec3 ambient = vec3(0.3);

    // diffuse
    float NdotL1 = max(dot(normal, directionalLightVector1), 0.0);
    vec3 diffuse = (directionalLightStrength1 * directionalLightColor1 * NdotL1);

    vec3 lighting = ambient + diffuse;

    vec3 finalColor = lighting * v_Color;

    fragColor = vec4(finalColor, u_Opacity);
}
