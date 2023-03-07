uniform float u_EnvIntensity;

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

vec3 rotate(vec3 v, vec3 k, float th) {
    return v * cos(th) + cross(k, v) * sin(th) + k * dot(k, v) * (1.0-cos(th));
}


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

    float r = blockR * BLOCK_R;
    float w = 2.0 * r + spread;
    float blockTop = r * (1.0 - r/w);

    vec3 pos0 = invMat * fragPosition;
    vec3 pos = abs(rotating && int(origPosAdj.x) == level ? rotate(pos0, -currAngle, axis) : pos0);

    float innerBound = BLOCK_R + spread2;
    float lightStrength = 1.6 * envIntensityAdjusted(), lightTravel = 1.2;
    //    float lightStrength = u_AOLightS * envIntensityAdjusted(), lightTravel = u_AOLightT;

    float planesStrength = spread * lightStrength;
    float planesTravel = planesStrength * lightTravel;

    vec3 planesDist = min(max(abs(pos - innerBound) - spread2, 0.0), planesTravel);
    float planesLight = length(planesStrength * (planesTravel - planesDist) / planesTravel);


    float poleR = (sqrt(2.0)-1.0) * r;
    float poleA = (4.0-PI) * r*r;
    float polesStrength = poleA * lightStrength * 1.5;
    float polesTravel = polesStrength * lightTravel * 1.5;

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
    float polesLight = polesTravel <= 0.0 ? 0.0 : length(polesStrength * (polesTravel - polesDist) / polesTravel);


    float outerBound = spreadRaw + BLOCK_R;
    float outerTravel = (spread + sqrt(poleA)) * lightStrength * lightTravel;
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
