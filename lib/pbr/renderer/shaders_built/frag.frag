#version 300 es


precision highp float;

#define PI 3.1415926535897932384626433832795


uniform int u_Debug;

uniform float u_EnvIntensity;
uniform float u_BevelW;

const float BLOCK_R = 0.5;


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

//vec3 rotateTh(vec3 v, vec3 k, float th) {
//    return v * cos(th) + cross(k, v) * sin(th) + k * dot(k, v) * (1.0-cos(th));
//}


float raySphereCorner(vec3 ro, vec3 rd, vec3 size, float rad) {
    vec3 oc = ro - size;
    vec3 dd = rd*rd;
    vec3 oo = oc*oc;
    vec3 od = oc*rd;
    float ra2 = rad*rad;

    float b = od.x + od.y + od.z;
    float c = oo.x + oo.y + oo.z - ra2;
    float h = b*b - c;
    if( h>0.0 ) {
        return -b-sqrt(h);
    }
    return -1.0;
}

float checkOtherCorners(vec3 ro, vec3 rd, vec3 size, float rad) {
    float t = raySphereCorner(ro*vec3(-1,1,1), rd*vec3(-1,1,1), size, rad);
    if( t>0.0 ) return t;

    t = raySphereCorner(ro*vec3(1,-1,1), rd*vec3(1,-1,1), size, rad);
    if( t>0.0 ) return t;

    t = raySphereCorner(ro*vec3(1,1,-1), rd*vec3(1,1,-1), size, rad);
    if( t>0.0 ) return t;

    return -1.0;
}


vec3 raySphere(vec3 p0, vec3 v, vec3 center, float r) {
    // p0 origin, v dir of the ray. center, r radius of sphere
    vec3 p = p0 - center;

    float a = dot(v, v);
    float b = 2.0 * dot(p, v);
    float c = dot(p, p) - r * r;

    float sq = (b * b) - (4.0 * a * c);

    if (sq < 0.0) {
        return vec3(0);
    }

    float sqr = sqrt(sq);
    float t1 = (-b + sqr) / (2.0 * a);
    float t2 = (-b - sqr) / (2.0 * a);
    bool blocked = t1 > 0.0 || t2 > 0.0;
    float tmin = min(t1, t2);
    float tmax = max(t1, t2);
    return vec3(blocked ? 1.0 : 0.0, tmin, tmax);
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

    return tmin <= tmax && tmax >= 0.0;
}


// intersect a ray with a rounded box
// https://iquilezles.org/articles/intersectors
float rayRoundedBox( vec3 ro, vec3 rd, vec3 size, float rad, float sizeMin )
{
    // bounding box
    vec3 m = 1.0/rd;
    vec3 n = m*ro;
    vec3 k = abs(m)*(size+rad);
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN = max( max( t1.x, t1.y ), t1.z );
    float tF = min( min( t2.x, t2.y ), t2.z );
    if( tN > tF || tF < 0.0) return -1.0;
    float t = tN;
    //    return t;

    // convert to first octant
    vec3 pos = ro+t*rd;
    vec3 s = sign(pos);
    ro  *= s;
    rd  *= s;
    pos *= s;

    // faces
    pos -= size;
    pos = max( pos.xyz, pos.yzx );
    if( min(min(pos.x,pos.y),pos.z)<0.0 ) return t;

    // some precomputation
    vec3 oc = ro - size;
    vec3 dd = rd*rd;
    vec3 oo = oc*oc;
    vec3 od = oc*rd;
    float ra2 = rad*rad;

    t = 1e20;
    float res = -1.0;

    // corner
    {
        float b = od.x + od.y + od.z;
        float c = oo.x + oo.y + oo.z - ra2;
        float h = b*b - c;
        if( h>0.0 ) {t = -b-sqrt(h); res = 2.0;}

        if (sizeMin < rad && !(h>0.0)) {
            float t2 = checkOtherCorners(ro, rd, size, rad);
            if( t2>0.0 ) { t = t2; res = 4.0; };
        }
    }

    // edge X
    {
        float a = dd.y + dd.z;
        float b = od.y + od.z;
        float c = oo.y + oo.z - ra2;
        float h = b*b - a*c;
        if( h>0.0 )
        {
            h = (-b-sqrt(h))/a;
            if( h>0.0 && h<t && abs(ro.x+rd.x*h)<size.x ) {t = h; res=3.0;}
        }
    }
    // edge Y
    {
        float a = dd.z + dd.x;
        float b = od.z + od.x;
        float c = oo.z + oo.x - ra2;
        float h = b*b - a*c;
        if( h>0.0 )
        {
            h = (-b-sqrt(h))/a;
            if( h>0.0 && h<t && abs(ro.y+rd.y*h)<size.y ) {t = h; res=3.0;}
        }
    }
    // edge Z
    {
        float a = dd.x + dd.y;
        float b = od.x + od.y;
        float c = oo.x + oo.y - ra2;
        float h = b*b - a*c;
        if( h>0.0 )
        {
            h = (-b-sqrt(h))/a;
            if( h>0.0 && h<t && abs(ro.z+rd.z*h)<size.z ) {t = h; res=3.0;}
        }
    }

    if( t>1e19 ) t=-1.0;

    return t;
    //    return res;
}

// normal of a rounded box
vec3 roundedBoxNormal(vec3 pos, vec3 size)
{
    return sign(pos)*normalize(max(abs(pos)-size,0.0));
}

float rayBlockIntersection(vec3 ray0, vec3 rayDir, vec3 blockPos, float blockR, float spread) {
    ray0 -= (blockPos * spread);

    float sizeOrig = (1.0-blockR)*BLOCK_R;

    return
    blockR > 0.99
    ? raySphereCorner(ray0, rayDir, vec3(sizeOrig), blockR*BLOCK_R) :
    rayRoundedBox(ray0, rayDir, vec3(sizeOrig), blockR*BLOCK_R, sizeOrig);
}

bool raySliceIntersection(vec3 ray0, vec3 rayDir, vec3 blockMin, vec3 blockMax, float spread) {
    return rayBox(ray0, rayDir, (blockMin*spread)-BLOCK_R, (blockMax*spread)+BLOCK_R);
}


vec3 adjustV(vec3 v, int axis) {
    return axis == 1 ? v.yxz : axis == 2 ? v.zyx : v;
}

float envIntensityAdjusted() {
    return u_EnvIntensity > 1.0 ? 0.75 + u_EnvIntensity * 0.25 : u_EnvIntensity * 0.5 + 0.5;
}

float blockOcclusion(
mat3 invMat, vec3 fragPosition, vec3 origPos, float blockR, float spreadRaw, float currAngle, int axis, int level
) {
    bool rotating = abs(currAngle) > 0.0;
    vec3 origPosAdj =  adjustV(origPos, axis);


    float spread = spreadRaw - 1.0;
    float spread2 = spread * 0.5;

    float outerBound = BLOCK_R + spreadRaw;
    float innerBound = BLOCK_R + spread2;


    float r = blockR * BLOCK_R;
    float w = 2.0 * r + spread;
    float blockTop = r * (1.0 - r/w);

    vec3 pos0 = invMat * fragPosition;
    vec3 pos = abs(rotating && int(origPosAdj.x) == level ? rotate(pos0, -currAngle, axis) : pos0);

    float lightStrength = 1.6 * envIntensityAdjusted(), lightTravel = 1.2;
    //    float lightStrength = u_AOLightS * envIntensityAdjusted(), lightTravel = u_AOLightT;

    float planesStrength = spread * lightStrength;
    float planesTravel = planesStrength * lightTravel;

    vec3 planesDist = min(max(abs(pos - innerBound) - spread2, 0.0), planesTravel);
    float planesLight = length(planesStrength * (planesTravel - planesDist) / planesTravel);


    float poleR = (sqrt(2.0)-1.0) * r;
    float poleA = (4.0-PI) * r*r;
    float bevelA = length(vec2(u_BevelW)) * length(vec2(u_BevelW));
    vec3 bevelDist = (pos - innerBound)/u_BevelW;
    vec3 poleAB = vec3(
    max(poleA, bevelA * min(1.0, bevelDist.x)),
    max(poleA, bevelA * min(1.0, bevelDist.y)),
    max(poleA, bevelA * min(1.0, bevelDist.z))
    );
    vec3 polesStrength = poleAB * lightStrength * 1.5;
    vec3 polesTravel = polesStrength * lightTravel * 1.5;

    vec3 polesDist = min(
    max(
    vec3(
    length(pos - vec3(pos.x, innerBound, innerBound)),
    length(pos - vec3(innerBound, pos.y, innerBound)),
    length(pos - vec3(innerBound, innerBound, pos.z))
    ) - length(vec2(poleR + spread2)),
    0.0
    ),
    polesTravel
    );
    vec3 polesLightV = vec3(
    polesTravel.x <= 0.0 ? 0.0 : polesStrength.x * (polesTravel.x - polesDist.x) / polesTravel.x,
    polesTravel.y <= 0.0 ? 0.0 : polesStrength.y * (polesTravel.y - polesDist.y) / polesTravel.y,
    polesTravel.z <= 0.0 ? 0.0 : polesStrength.z * (polesTravel.z - polesDist.z) / polesTravel.z
    );
    float polesLight = length(polesLightV);


    float planePoleTravel = (spread + sqrt(poleA)) * lightStrength * lightTravel;
    float bevelTravel = u_BevelW * lightStrength * lightTravel;
    float outerTravel = max(planePoleTravel, bevelTravel);
    vec3 outerDist = min(max(outerBound - blockTop - abs(pos0), 0.0), outerTravel);
    vec3 outerV = ((outerTravel - outerDist) / outerTravel);

    // 4th root( sum(outerV^4) )
    float outerLight = pow(
    outerV.x*outerV.x*outerV.x*outerV.x + outerV.y*outerV.y*outerV.y*outerV.y + outerV.z*outerV.z*outerV.z*outerV.z,
    0.25
    );

    // rotating
    if (abs(currAngle) > 0.0 && outerLight < 1.0) {
        mat3 axisM  = mat3(1, 0, 0,    0, 1, 0,    0, 0, 1);
        mat3 scaleM = mat3(1, 5, 5,    5, 1, 5,    5, 5, 1);
        mat3 moveM  = mat3(0, 1, 0,    0, 0, 1,    1, 0, 0);

        vec3 rotLightBound = vec3(BLOCK_R + spread) * scaleM[axis];
        vec3 p0 = rotate(pos0, -currAngle, axis);
        float rotLight = 0.0;

        for (int i=0; i<4; i++) {
            vec3 p = rotate(p0, float(i)*PI*0.5, axis);
            p -= (axisM[axis] * float(level) * spreadRaw);
            p -= vec3(outerBound) * moveM[axis] + vec3(BLOCK_R + spread) * 5.0 * moveM[axis];

            vec3 rotDist = max(abs(p) - rotLightBound - blockTop, 0.0);
            float rotLightI = clamp(1.0 - length(rotDist) / outerTravel, 0.0, 1.0);
            rotLight += rotLightI * rotLightI * rotLightI * rotLightI;
        }

        rotLight = pow(rotLight, 0.25);
        outerLight = max(rotLight, outerLight);
    }

    float ao = length(vec3(outerLight, planesLight, polesLight));
    return clamp(ao, 0.0, 1.0);
}


float blockIntersection(
out vec3 outReflect, mat3 mat, mat3 invMat, vec3 fragPosition, vec3 rayDir, vec3 origPos, float blockR, float spread, float currAngle, int axis, int level
) {
    outReflect = rayDir;

    bool rotating = abs(currAngle) > 0.0;
    vec3 invRayDir = invMat * rayDir;
    vec3 invRay0 = invMat * fragPosition;

    vec3 origPosAdj = adjustV(origPos, axis);

    float t = -1.0;
    vec3 hitPoint = vec3(0);
    bool hitBlockRot = false;

    for (int _a = -1; _a < 2; _a++) {
        int a = origPosAdj.x < 0.0 ? _a : -_a;

        vec3 iRayDir = invRayDir, iRay0 = invRay0;

        if (rotating && a == level) {
            iRayDir = rotate(iRayDir, -currAngle, axis);
            iRay0 = rotate(iRay0, -currAngle, axis);
        }
        if (
        !raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, -1, -1), axis), adjustV(vec3(a, 1, 1), axis), spread)
        ) continue;

        for (int _b = -1; _b < 2; _b++) {
            int b = origPosAdj.y < 0.0 ? _b : -_b;

            if (
            !raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, b, -1), axis), adjustV(vec3(a, b, 1), axis), spread)
            ) continue;

            for (int _c = -1; _c < 2; _c++) {
                int c = origPosAdj.z < 0.0 ? _c : -_c;

                //                 if(!(a==1&&b==1&&c==1)) continue;

                vec3 blockPos =  adjustV(vec3(a, b, c), axis);

                if (distance(origPos, blockPos) < BLOCK_R) continue;

                float t2 = rayBlockIntersection(iRay0, iRayDir, blockPos, blockR, spread);

                if (t2>=0.0 && (t2 < t || t<0.0)) {
                    t=t2; hitPoint=(iRay0-(blockPos * spread))+t2*iRayDir; hitBlockRot=(rotating && a == level);

                    vec3 newNormal = roundedBoxNormal(hitPoint, vec3((1.0-max(0.001,blockR))*BLOCK_R));
                }
            }
        }
    }

    if (t >= 0.0) {
        vec3 newNormal = roundedBoxNormal(hitPoint, vec3((1.0-max(0.001,blockR))*BLOCK_R));
        if (hitBlockRot) {
            newNormal = rotate(newNormal, currAngle, axis);
        }
        newNormal = normalize( mat * newNormal );
        outReflect = normalize(reflect(rayDir, newNormal));
    }

    return t;
}


uniform float u_Exposure;
uniform int u_Tone;
uniform vec3 u_EnvColor;


const float GAMMA = 2.2;
const float INV_GAMMA = 1.0 / GAMMA;

// tone map enum
const int TONEMAP_ACES_NARKOWICZ = 1;
const int TONEMAP_ACES_HILL = 2;
const int TONEMAP_ACES_HILL_EXPOSURE_BOOST = 3;

// sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
const mat3 ACESInputMat = mat3
(
0.59719, 0.07600, 0.02840,
0.35458, 0.90834, 0.13383,
0.04823, 0.01566, 0.83777
);


// ODT_SAT => XYZ => D60_2_D65 => sRGB
const mat3 ACESOutputMat = mat3
(
1.60475, -0.10208, -0.00327,
-0.53108,  1.10813, -0.07276,
-0.07367, -0.00605,  1.07602
);


// linear to sRGB approximation
// see http://chilliant.blogspot.com/2012/08/srgb-approximations-for-hlsl.html
vec3 linearTosRGB(vec3 color)
{
    return pow(color, vec3(INV_GAMMA));
}


// sRGB to linear approximation
// see http://chilliant.blogspot.com/2012/08/srgb-approximations-for-hlsl.html
vec3 sRGBToLinearV3(vec3 srgbIn)
{
    return vec3(pow(srgbIn.xyz, vec3(GAMMA)));
}

float sRGBToLinearF(float srgbIn)
{
    return pow(srgbIn, GAMMA);
}


vec4 sRGBToLinear(vec4 srgbIn)
{
    return vec4(sRGBToLinearV3(srgbIn.xyz), srgbIn.w);
}


// ACES tone map (faster approximation)
// see: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
vec3 toneMapACES_Narkowicz(vec3 color)
{
    const float A = 2.51;
    const float B = 0.03;
    const float C = 2.43;
    const float D = 0.59;
    const float E = 0.14;
    return clamp((color * (A * color + B)) / (color * (C * color + D) + E), 0.0, 1.0);
}


// ACES filmic tone map approximation
// see https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
vec3 RRTAndODTFit(vec3 color)
{
    vec3 a = color * (color + 0.0245786) - 0.000090537;
    vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
    return a / b;
}


// tone mapping
vec3 toneMapACES_Hill(vec3 color)
{
    color = ACESInputMat * color;

    // Apply RRT and ODT
    color = RRTAndODTFit(color);

    color = ACESOutputMat * color;

    // Clamp to [0, 1]
    color = clamp(color, 0.0, 1.0);

    return color;
}


vec3 toneMap(vec3 color)
{
    color *= u_Exposure;

    if (u_Tone == TONEMAP_ACES_NARKOWICZ) {
        color = toneMapACES_Narkowicz(color);
    }

    if (u_Tone == TONEMAP_ACES_HILL) {
        color = toneMapACES_Hill(color);
    }

    if (u_Tone == TONEMAP_ACES_HILL_EXPOSURE_BOOST) {
        // boost exposure as discussed in https://github.com/mrdoob/three.js/pull/19621
        // this factor is based on the exposure correction of Krzysztof Narkowicz in his
        // implemetation of ACES tone mapping
        color /= 0.6;
        color = toneMapACES_Hill(color);
    }

    return linearTosRGB(color);
}

vec3 desaturate(vec3 color) {
    float greyAmt = 0.75;
    float grey = color.g*0.59 + color.r*0.3 + color.b*0.11;
    return mix(color, vec3(grey), greyAmt);
}

vec4 desaturateV4(vec4 color) {
    return vec4(desaturate(color.rgb), color.a);
}


vec3 colorLighting(vec3 color) {
    float strength = 0.5;
    return color * (1.0+strength*(u_EnvColor - vec3(0.5)));
}

vec4 colorLightingV4(vec4 color) {
    return vec4(colorLighting(color.rgb), color.a);
}



// IBL


uniform int u_MipCount;
uniform samplerCube u_LambertianEnvSampler;
uniform samplerCube u_GGXEnvSampler;
uniform sampler2D u_GGXLUT;

uniform mat3 u_EnvRotation;

uniform sampler2D u_NormalSampler0;
uniform sampler2D u_NormalSampler1;
uniform sampler2D u_NormalSampler2;
uniform float u_NormalScale;




in vec3 v_Position;
in vec3 v_PositionOrig;
in vec3 v_Normal;
in vec3 v_NormalOrig;
in vec3 v_Color;

uniform vec3 u_BlockPositionOrig;

uniform int u_NonVColor;
uniform int u_ProcColor;


vec3 sortV3(vec3 v) {
    v = v.y > v.x && v.y > v.z ? v.yxz :
    v.z > v.x && v.z > v.y ? v.zyx : v.xyz;
    v = v.z > v.y ? v.xzy : v.xyz;
    return v;
}


vec3 sortedUV() {
    vec3 v0 = v_PositionOrig;
    //    vec3 v = v0;
    vec3 v = v0 + u_BlockPositionOrig;

    vec3 av = abs(v_NormalOrig);

    if (av.y > av.x && av.y > av.z) {
        return vec3(v.x, sign(v0.y)*v.z, sign(v0.y)*(2.0/3.1));
    }
    if (av.x > av.y && av.x > av.z) {
        return vec3(sign(v0.x)*-v.z, -v.y, sign(v0.x)*(9.0/5.3));
    }
    return vec3(sign(v0.z)*v.x, -v.y, sign(v0.z)*(19.0/7.0));
}


vec3 combineNormals(vec3 n1, vec3 n2) {
    return n1 + n2 - vec3(0, 0, 1);
}


vec4 getVertexColor()
{
    vec4 color = vec4(u_NonVColor == 1 ? vec3(1) : v_Color, 1.0);
    return color;
}

vec4 metallicColorScale(vec4 color, float metallic) {
    return vec4(color.rgb / (1.0 - metallic * min(0.4, 1.0-sortV3(color.rgb).r)), color.a);
}

vec4 proceduralAdjustment(vec4 color) {
    if (u_ProcColor==1) {
        vec3 n2 = vec3(0.08) + sin(v_PositionOrig) / 10.0;
        return vec4(normalize(n2), color.a);
    }
    return color;
}


struct NormalInfo {
    vec3 ng;   // Geometry normal
    vec3 m;    // Geometry tangent
    vec3 l;    // Geometry bitangent
    vec3 n;    // Shading normal
    vec3 ntex; // Normal from texture, scaling is accounted for.
};


float clampedDot(vec3 x, vec3 y)
{
    return clamp(dot(x, y), 0.0, 1.0);
}

//
//float max3(vec3 v)
//{
//    return max(max(v.x, v.y), v.z);
//}



//uniform float u_EnvIntensity;


uniform int u_Axis;
uniform int u_Level;

uniform float u_BlockR;
uniform float u_Spread;
uniform float u_CurrAngle;

uniform int u_EnableBlocking;
uniform int u_EnableBlockingAO;

uniform vec3 u_BlockPosition;
uniform mat4 u_RubikMatrix;
uniform mat3 u_RubikMatrixInv;


float blockAO() {
    return sRGBToLinearF(blockOcclusion(
    u_RubikMatrixInv, v_Position, u_BlockPosition, u_BlockR, u_Spread, u_CurrAngle, u_Axis, u_Level
    ));
}

float blockIBL(vec3 rayDir, out vec3 outReflect) {
    return u_EnableBlocking == 1 ? blockIntersection(
    outReflect, mat3(u_RubikMatrix), u_RubikMatrixInv, v_Position, rayDir, u_BlockPosition, u_BlockR, u_Spread, u_CurrAngle, u_Axis, u_Level
    ) : -1.0;
}


vec3 getDiffuseLight(vec3 n)
{
    return colorLighting(desaturate(texture(u_LambertianEnvSampler, u_EnvRotation * n).rgb)) * u_EnvIntensity;
}


vec4 getSpecularSample(vec3 reflection, float lod)
{
    return colorLightingV4(desaturateV4(textureLod(u_GGXEnvSampler, u_EnvRotation * reflection, lod))) * u_EnvIntensity;
}

vec3 getIBLRadianceGGX(vec3 n, vec3 v, float roughness, vec3 F0, float specularWeight, float metallic)
{
    float NdotV = clampedDot(n, v);
    float lod = roughness * float(u_MipCount - 1);
    vec3 reflection = normalize(reflect(-v, n));

    vec3 outReflect = vec3(0);
    float t = blockIBL(reflection, outReflect);

    vec2 brdfSamplePoint = clamp(vec2(NdotV, roughness), vec2(0.0, 0.0), vec2(1.0, 1.0));
    vec2 f_ab = texture(u_GGXLUT, brdfSamplePoint).rg;
    vec4 specularSample = getSpecularSample(reflection, lod);


    if (t >= 0.0) {
        //        float t2 = blockIBL(outReflect, outReflect); if (t2 >=0.0) blockIBL(outReflect, outReflect);

        vec4 specularSample2 = clamp(getSpecularSample(outReflect, lod) * (metallic*0.75+0.25), 0.0, metallic*0.5+0.25) * 0.75;

        specularSample = clamp(specularSample, 0.0, 0.75) * 0.75;
        specularSample2 = mix(specularSample, specularSample2, u_BlockR*0.5+0.5);

        specularSample = mix(specularSample2, specularSample, (clamp(roughness, 0.0, 0.5) * 2.0) * ((metallic*0.5 + 0.5) + (0.5 - metallic*0.5)));
    }

    vec3 specularLight = specularSample.rgb;

    // see https://bruop.github.io/ibl/#single_scattering_results at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera
    vec3 Fr = max(vec3(1.0 - roughness), F0) - F0;
    vec3 k_S = F0 + Fr * pow(1.0 - NdotV, 5.0);
    vec3 FssEss = k_S * f_ab.x + f_ab.y;

    return specularWeight * specularLight * FssEss;
}


// specularWeight is introduced with KHR_materials_specular
vec3 getIBLRadianceLambertian(vec3 n, vec3 v, float roughness, vec3 diffuseColor, vec3 F0, float specularWeight)
{
    float NdotV = clampedDot(n, v);
    vec2 brdfSamplePoint = clamp(vec2(NdotV, roughness), vec2(0.0, 0.0), vec2(1.0, 1.0));
    vec2 f_ab = texture(u_GGXLUT, brdfSamplePoint).rg;

    vec3 irradiance = getDiffuseLight(n);

    // see https://bruop.github.io/ibl/#single_scattering_results at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera

    vec3 Fr = max(vec3(1.0 - roughness), F0) - F0;
    vec3 k_S = F0 + Fr * pow(1.0 - NdotV, 5.0);
    vec3 FssEss = specularWeight * k_S * f_ab.x + f_ab.y; // <--- GGX / specular light contribution (scale it down if the specularWeight is low)

    // Multiple scattering, from Fdez-Aguera
    float Ems = (1.0 - (f_ab.x + f_ab.y));
    vec3 F_avg = specularWeight * (F0 + (1.0 - F0) / 21.0);
    vec3 FmsEms = Ems * FssEss * F_avg / (1.0 - F_avg * Ems);
    vec3 k_D = diffuseColor * (1.0 - FssEss + FmsEms); // we use +FmsEms as indicated by the formula in the blog post (might be a typo in the implementation)

    return (FmsEms + k_D) * irradiance;
}


// Metallic Roughness
uniform float u_MetallicFactor;
uniform float u_RoughnessFactor;
uniform vec4 u_BaseColorFactor;

uniform vec3 u_Camera;


struct MaterialInfo
{
    float ior;
    float perceptualRoughness;      // roughness value, as authored by the model creator (input to shader)
    vec3 f0;                        // full reflectance color (n incidence angle)

    float alphaRoughness;           // roughness mapped to a more linear change in the roughness (proposed by [2])
    vec3 c_diff;

    vec3 f90;                       // reflectance color at grazing angle
    float metallic;

    vec3 baseColor;
//
//    float sheenRoughnessFactor;
//    vec3 sheenColorFactor;
//
//    vec3 clearcoatF0;
//    vec3 clearcoatF90;
//    float clearcoatFactor;
//    vec3 clearcoatNormal;
//    float clearcoatRoughness;
//
//    // KHR_materials_specular
    float specularWeight; // product of specularFactor and specularTexture.a
//
//    float transmissionFactor;
//
//    float thickness;
//    vec3 attenuationColor;
//    float attenuationDistance;
//
//    // KHR_materials_iridescence
//    float iridescenceFactor;
//    float iridescenceIor;
//    float iridescenceThickness;
};


// Get normal, tangent and bitangent vectors.
NormalInfo getNormalInfo(vec3 v)
{
    vec3 UVW = sortedUV();
    vec2 UV = UVW.xy;

    vec3 uv_dx = dFdx(vec3(UV, 0.0));
    vec3 uv_dy = dFdy(vec3(UV, 0.0));

    if (length(uv_dx) + length(uv_dy) <= 1e-6) {
        uv_dx = vec3(1.0, 0.0, 0.0);
        uv_dy = vec3(0.0, 1.0, 0.0);
    }

    vec3 t_ = (uv_dy.t * dFdx(v_Position) - uv_dx.t * dFdy(v_Position)) /
    (uv_dx.s * uv_dy.t - uv_dy.s * uv_dx.t);

    vec3 n, t, b, ng;

    // Normals are either present as vertex attributes or approximated.
    ng = normalize(v_Normal);
    t = normalize(t_ - ng * dot(ng, t_));
    b = cross(ng, t);

    // For a back-facing surface, the tangential basis vectors are negated.
    if (gl_FrontFacing == false)
    {
        t *= -1.0;
        b *= -1.0;
        ng *= -1.0;
    }

    // Compute normals:
    NormalInfo info;
    info.ng = ng;

    // normal maps
    float uv = UVW.z;
    vec3 ntex0 = normalize(texture(u_NormalSampler0, (UV/3.0)+uv).rgb * 2.0 - 1.0);
    vec3 ntex1 = normalize(texture(u_NormalSampler1, (UV/4.3)+uv).rgb * 2.0 - 1.0);
    vec3 ntex2 = normalize(texture(u_NormalSampler2, (UV/7.0)+uv*3.0).rgb * 2.0 - 1.0);
    ntex0.r *= (abs(ntex0.r) < 0.05 ? 0.5 : 1.0);
    ntex0.g *= (abs(ntex0.g) < 0.05 ? 0.5 : 1.0);
    ntex1.r *= (abs(ntex1.r) < 0.075 ? 0.25 : 1.0);
    ntex1.g *= (abs(ntex1.g) < 0.075 ? 0.25 : 1.0) * -1.0;
    ntex2.r *= (abs(ntex2.r) < 0.1 ? 0.5 : 1.0);
    ntex2.g *= (abs(ntex2.g) < 0.1 ? 0.5 : 1.0);

    vec3 ntex = vec3(0, 0, 1);
    ntex = combineNormals(ntex, ntex0);
    ntex = combineNormals(ntex, ntex1);
    ntex = combineNormals(ntex, ntex2);
    ntex = normalize(clamp(ntex, -1.0, 1.0));

    float scale = u_NormalScale * u_NormalScale;
    info.ntex = normalize(ntex * vec3(scale, scale, 1.0));
    info.n = normalize(mat3(t, b, ng) * info.ntex);


    info.m = t;
    info.l = b;
    return info;
}




vec4 getBaseColor()
{
    vec4 baseColor = vec4(1);

    baseColor = u_BaseColorFactor;

    baseColor = proceduralAdjustment(baseColor);

    return sRGBToLinear(metallicColorScale(baseColor * getVertexColor(), u_MetallicFactor));
}



MaterialInfo getMetallicRoughnessInfo(MaterialInfo info)
{
    info.metallic = u_MetallicFactor;
    info.perceptualRoughness = u_RoughnessFactor;

    // Achromatic f0 based on IOR.
    info.c_diff = mix(info.baseColor.rgb,  vec3(0), info.metallic);
    info.f0 = mix(info.f0, info.baseColor.rgb, info.metallic);
    return info;
}


out vec4 g_finalColor;


void main()
{
    vec4 baseColor = getBaseColor();

    baseColor.a = 1.0;

    vec3 v = normalize(u_Camera - v_Position);
    NormalInfo normalInfo = getNormalInfo(v);
    vec3 n = normalInfo.n;
    vec3 t = normalInfo.m;
    vec3 b = normalInfo.l;

    MaterialInfo materialInfo;
    materialInfo.baseColor = baseColor.rgb;

    // The default index of refraction of 1.5 yields a dielectric normal incidence reflectance of 0.04.
    materialInfo.ior = 1.5;
    materialInfo.f0 = vec3(0.04);
    materialInfo.specularWeight = 1.0;


    // MATERIAL_METALLICROUGHNESS
    materialInfo = getMetallicRoughnessInfo(materialInfo);

    materialInfo.perceptualRoughness = clamp(materialInfo.perceptualRoughness, 0.0, 1.0);
    materialInfo.metallic = clamp(materialInfo.metallic, 0.0, 1.0);

    // Roughness is authored as perceptual roughness; as is convention,
    // convert to material roughness by squaring the perceptual roughness.
    materialInfo.alphaRoughness = materialInfo.perceptualRoughness * materialInfo.perceptualRoughness;

    // Anything less than 2% is physically impossible and is instead considered to be shadowing. Compare to "Real-Time-Rendering" 4th editon on page 325.
    materialInfo.f90 = vec3(1.0);

    // LIGHTING
    vec3 f_specular = vec3(0.0);
    vec3 f_diffuse = vec3(0.0);
    //    vec3 f_emissive = vec3(0.0);
    //    vec3 f_clearcoat = vec3(0.0);
    //    vec3 f_sheen = vec3(0.0);
    //    vec3 f_transmission = vec3(0.0);

    //    float albedoSheenScaling = 1.0;


    // Calculate lighting contribution from image based lighting source (IBL)
    // USE_IBL
    f_specular += getIBLRadianceGGX(n, v, materialInfo.perceptualRoughness, materialInfo.f0, materialInfo.specularWeight, materialInfo.metallic);
    f_diffuse += getIBLRadianceLambertian(n, v, materialInfo.perceptualRoughness, materialInfo.c_diff, materialInfo.f0, materialInfo.specularWeight);


    float ao = u_EnableBlockingAO == 1 ? blockAO() : 1.0;

    //    // Apply optional PBR terms for additional (optional) shading
    //    // HAS_OCCLUSION_MAP
    //    ao = texture(u_OcclusionSampler,  getOcclusionUV()).r;
    //    // apply ambient occlusion to all lighting that is not punctual
    //    f_diffuse = mix(f_diffuse, f_diffuse * ao, u_OcclusionStrength);
    //    f_specular = mix(f_specular, f_specular * ao, u_OcclusionStrength);
    f_specular *= ao;
    f_diffuse *= ao;


    vec3 color = f_diffuse + f_specular;




    vec3 finalColor;

    switch(u_Debug) {
        case 1: finalColor = linearTosRGB(baseColor.rgb); break;
        default: finalColor = toneMap(color);
    }
    g_finalColor = vec4(finalColor, baseColor.a);


}