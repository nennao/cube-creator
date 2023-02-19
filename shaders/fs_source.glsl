#version 300 es

precision highp float;


uniform float u_Opacity;
uniform vec3 u_ViewPosition;

uniform float u_BlockR;
uniform float u_Spread;
uniform float u_CurrAngle;
uniform int u_Axis;
uniform int u_Level;

uniform int u_EnableBlocking;

uniform vec3 u_BlockPosition;
uniform mat3 u_RubikMatrixInv;

uniform samplerCube u_GGXEnvSampler;

in vec3 v_Color;
in vec3 v_Normal;
in vec3 v_FragPosition;

out vec4 fragColor;


#pragma glslify: rotate = require('./utils.glsl')
#pragma glslify: blockIntersection = require('./utils.glsl')


vec3 toneMap(vec3 color) {
    return pow(color, vec3(1.0/2.2));
}

bool _blockIntersection(vec3 rayDir) {
    return blockIntersection(
        u_RubikMatrixInv, v_FragPosition, rayDir, u_BlockPosition, u_BlockR, u_Spread, u_CurrAngle, u_Axis, u_Level
    );
}

void main() {
    vec3 normal = v_Normal;

    vec3 directionalLightVector1 = vec3(0, 0, 1);
    vec3 directionalLightColor1 = vec3(1, 1, 1);
    float directionalLightStrength1 = 0.7;

    // reflection
    vec3 viewDir = normalize(u_ViewPosition - v_FragPosition);
    vec3 reflectVector = reflect(-viewDir, normalize(normal));
    bool blocked = u_EnableBlocking == 1 ? _blockIntersection(reflectVector) : false;

    vec3 reflection = toneMap(textureLod(u_GGXEnvSampler, reflectVector, 0.0).rgb);
    vec3 someReflection = (blocked ? 0.00 : 0.25) * reflection;

    // ambient
    vec3 ambient = vec3(0.3);

    // diffuse
    float NdotL1 = max(dot(normal, directionalLightVector1), 0.0);
    vec3 diffuse = (directionalLightStrength1 * directionalLightColor1 * NdotL1);

    vec3 lighting = ambient + diffuse;

    vec3 finalColor = lighting * v_Color + someReflection;


    fragColor = vec4(finalColor, u_Opacity);


//    float greyF = 0.0;
//    float lightF = 0.0;
//
//    float grey = finalColor.g*0.59 + finalColor.r*0.3 + finalColor.b*0.11;
//    vec3 mixed = greyF*vec3(grey) + (1.0-greyF)*finalColor;
//    vec3 lightened = mixed * (1.0-lightF) + lightF;
//
//    fragColor = vec4(lightened, u_Opacity);
}
