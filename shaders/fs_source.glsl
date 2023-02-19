#version 300 es

precision highp float;

const float BLOCK_R = 0.5;

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


vec3 rotateX(vec3 v, float theta) {
    return vec3(
        v.x,
        v.y * cos(theta) - v.z * sin(theta),
        v.y * sin(theta) + v.z * cos(theta)
    );
}
vec3 rotateY(vec3 v, float theta) {
    return vec3(
        v.z * sin(theta) + v.x * cos(theta),
        v.y,
        v.z * cos(theta) - v.x * sin(theta)
    );
}
vec3 rotateZ(vec3 v, float theta) {
    return vec3(
        v.x * cos(theta) - v.y * sin(theta),
        v.x * sin(theta) + v.y * cos(theta),
        v.z
    );
}
vec3 rotate(vec3 v, float theta, int axis) {
    return axis == 0 ? rotateX(v, theta) : axis == 1 ? rotateY(v, theta) : rotateZ(v, theta);
}


bool raySphere(vec3 p0, vec3 v, vec3 center, float r) {
    // p0 origin, v dir of the ray. center, r radius of sphere
    vec3 p = p0 - center;

    float a = dot(v, v);
    float b = 2.0 * dot(p, v);
    float c = dot(p, p) - r * r;

    float sq = (b * b) - (4.0 * a * c);

    if (sq < 0.0) {
        return false;
    }

    float sqr = sqrt(sq);
    return (-b + sqr) / (2.0 * a) > 0.0 || (-b - sqr) / (2.0 * a) > 0.0;
}


bool rayBox(vec3 rayOriginV, vec3 rayDirV, vec3 boxMinV, vec3 boxMaxV) {
    vec3 rayInvDirV = 1.0/rayDirV;

    float t1 = (boxMinV.x - rayOriginV.x) * rayInvDirV.x;
    float t2 = (boxMaxV.x - rayOriginV.x) * rayInvDirV.x;

    float tmin = min(t1, t2);
    float tmax = max(t1, t2);

    t1 = (boxMinV.y - rayOriginV.y) * rayInvDirV.y;
    t2 = (boxMaxV.y - rayOriginV.y) * rayInvDirV.y;

    tmin = max(tmin, min(t1, t2));
    tmax = min(tmax, max(t1, t2));

    t1 = (boxMinV.z - rayOriginV.z) * rayInvDirV.z;
    t2 = (boxMaxV.z - rayOriginV.z) * rayInvDirV.z;

    tmin = max(tmin, min(t1, t2));
    tmax = min(tmax, max(t1, t2));

    return tmin < tmax && tmax >= 0.0;
}


bool rayBlockIntersection(vec3 ray0, vec3 rayDir, vec3 block) {
    if (distance(u_BlockPosition, block) < BLOCK_R) return false;

    ray0 -= (block * u_Spread);

    float testR = BLOCK_R * (1.0 + ((sqrt(3.0)-1.0) * (1.0-u_BlockR)));

    return (
        raySphere(ray0, rayDir, vec3(0), testR) &&
        (u_BlockR > 0.99 ||
         rayBox(ray0, rayDir, vec3(-BLOCK_R), vec3(BLOCK_R)))
    );
}


bool raySliceIntersection(vec3 ray0, vec3 rayDir, vec3 blockMin, vec3 blockMax) {
    return rayBox(ray0, rayDir, (blockMin*u_Spread)-BLOCK_R, (blockMax*u_Spread)+BLOCK_R);
}

vec3 adjustV(vec3 v) {
    return u_Axis == 1 ? v.yxz : u_Axis == 2 ? v.zyx : v;
}

bool blockIntersection(vec3 rayDir) {
    bool rotating = abs(u_CurrAngle) > 0.01;
    vec3 invRayDir = u_RubikMatrixInv * rayDir;
    vec3 invRay0 = u_RubikMatrixInv * v_FragPosition;

    for (int a = -1; a < 2; a++) {

        vec3 iRayDir = invRayDir, iRay0 = invRay0;

        if (rotating && a == u_Level) {
            iRayDir = rotate(iRayDir, -u_CurrAngle, u_Axis);
            iRay0 = rotate(iRay0, -u_CurrAngle, u_Axis);
        }
        if (!raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, -1, -1)), adjustV(vec3(a, 1, 1)))) continue;

        for (int b = -1; b < 2; b++) {
            if (!raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, b, -1)), adjustV(vec3(a, b, 1)))) continue;

            for (int c = -1; c < 2; c++) {
                if (rayBlockIntersection(iRay0, iRayDir, adjustV(vec3(a, b, c)))) {
                    return true;
                }
            }
        }
    }
    return false;
}


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
    bool blocked = u_EnableBlocking == 1 ? blockIntersection(reflectVector) : false;

    vec3 reflection = linearTosRGB(textureLod(u_GGXEnvSampler, reflectVector, 0.0).rgb);
    vec3 someReflection = (blocked ? 0.00 : 0.25) * reflection;

    // ambient
    vec3 ambient = vec3(0.3);

    // diffuse
    float NdotL1 = max(dot(normal, directionalLightVector1), 0.0);
    vec3 diffuse = (directionalLightStrength1 * directionalLightColor1 * NdotL1);

    vec3 lighting = ambient + diffuse;

    vec3 finalColor = lighting * v_Color + someReflection;


    fragColor = vec4(finalColor, u_Opacity);
}
