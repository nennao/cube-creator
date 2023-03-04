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

float blockIntersection(
    out vec3 outReflect, mat3 mat, mat3 invMat, vec3 fragPosition, vec3 rayDir, vec3 origPos, float blockR, float spread, float currAngle, int axis, int level
) {
    outReflect = rayDir;

    bool rotating = abs(currAngle) > 0.0;
    vec3 invRayDir = invMat * rayDir;
    vec3 invRay0 = invMat * fragPosition;

    vec3 origPosAdj = adjustV(origPos, axis);
    vec3 origPosCmp = (rotating && int(origPosAdj.x) == level) ? rotate(origPos, currAngle, axis) : vec3(origPos);

    float t = -1.0;
    float dist = 1e20;
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

//                if(!(a==1&&b==1&&c==1)) continue;

                vec3 blockPos =  adjustV(vec3(a, b, c), axis);
                if (distance(origPos, blockPos) < BLOCK_R) continue;

                vec3 blockPosCmp = (rotating && a == level) ? rotate(blockPos, currAngle, axis) : vec3(blockPos);
                float dist2 = distance(origPosCmp, blockPosCmp);

                if (t>=0.0 && dist <= dist2) continue;
                float t2 = rayBlockIntersection(iRay0, iRayDir, blockPos, blockR, spread);

                if (t2>=0.0 && (t2 < t || t<0.0)) {
                    t=t2; dist=dist2; hitPoint=(iRay0-(blockPos * spread))+t2*iRayDir; hitBlockRot=(rotating && a == level);
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


float blockAO(
    mat3 invMat, vec3 fragPosition, vec3 rayDir, vec3 origPos, float blockR, float spread, float currAngle, int axis, int level
) {
    float pad =(spread-1.0)*0.5;

    bool rotating = abs(currAngle) > 0.0;
    vec3 invRayDir = invMat * rayDir;
    vec3 invRay0 = invMat * fragPosition;

    vec3 origPosAdj = adjustV(origPos, axis);
    vec3 origPosCmp = (rotating && int(origPosAdj.x) == level) ? rotate(origPos, currAngle, axis) : vec3(origPos);

    float t = -1.0;
    float dist = 1e20;
    vec3 hitPoint = vec3(0);
    vec3 hitBlock = vec3(0);
    vec3 hitPoint2 = vec3(0);

    for (int a = -1; a < 2; a++) {

        vec3 iRayDir = invRayDir, iRay0 = invRay0;

        if (rotating && a == level) {
            iRayDir = rotate(iRayDir, -currAngle, axis);
            iRay0 = rotate(iRay0, -currAngle, axis);
        }
        if (
            !raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, -1, -1), axis), adjustV(vec3(a, 1, 1), axis), spread)
        ) continue;

        for (int b = -1; b < 2; b++) {
            if (
                !raySliceIntersection(iRay0, iRayDir, adjustV(vec3(a, b, -1), axis), adjustV(vec3(a, b, 1), axis), spread)
            ) continue;

            for (int c = -1; c < 2; c++) {
                if(!(a==1&&b==1&&c==1)) continue;
                vec3 blockPos =  adjustV(vec3(a, b, c), axis);
                if (distance(origPos, blockPos) < BLOCK_R) continue;

                vec3 blockPosCmp = (rotating && a == level) ? rotate(blockPos, currAngle, axis) : vec3(blockPos);
                float dist2 = distance(origPosCmp, blockPosCmp);

//                if (dist2 > 1.99999) continue;  // blocks further than this (sqrt of 3) shouldnt contribute to AO

                if (t>0.0 && dist <= dist2) continue;
                float t2 = rayBlockIntersection(iRay0, iRayDir, blockPos, blockR, spread);

                if (t2>0.0 && (t2 < t || t<0.0)) {
                    t=t2; dist=dist2; hitPoint=iRay0+t2*iRayDir; hitPoint2=(iRay0-(blockPos * spread))+t2*iRayDir; hitBlock=blockPos;
                }
            }
        }
    }

    float ao = 1.0;

//    return vec2(t, ao);

    if (t > 0.0) {
        float r = blockR * BLOCK_R;
        float w = 2.0 * r + spread - 1.0;
        float blockTop = blockR < 0.01 ? 0.0 : (2.0 * (r - r * sin(acos(r/w))));

        float surfaceTravel = (spread - 1.0) * 2.0 + blockR;
        float spaceTravel = (spread - 1.0/spread) + (blockR*blockR*blockR/1.5);

        float shadowR = 0.5 * (1.0-blockR);
        float outerBoxR = spread + BLOCK_R;
        vec3 pos = abs(hitPoint);
        vec3 edgeDist = max(pos - (outerBoxR-blockTop-surfaceTravel), 0.0) / surfaceTravel;
        vec3 edgeDistB = max(abs(invRay0) - (outerBoxR-blockTop-surfaceTravel), 0.0) / surfaceTravel;
        edgeDist = length(edgeDist) > length(edgeDistB) ? edgeDist : edgeDistB;

        vec3 light1 = edgeDist.y > edgeDist.x && edgeDist.y > edgeDist.z ? edgeDist.yxz :
                     edgeDist.z > edgeDist.x && edgeDist.z > edgeDist.y ? edgeDist.zyx : edgeDist.xyz;
        light1 = light1.z > light1.y ? light1.xzy : light1.xyz;

        float ao1 = light1.y < shadowR ? max(light1.x, light1.y) : shadowR + length(light1.xy - shadowR);


        vec3 facingOut = -(sign(hitPoint2) * sign(hitBlock));
        facingOut = clamp(facingOut + 1.0, 0.0, 1.0) * 2.0 - 1.0; // change -1, 0, 1 to -1, 1, 1
        vec3 pos2b = abs(hitPoint2);
        vec3 pos2 = pos2b * facingOut;
        pos2 = pos2b.x > pos2b.y && pos2b.x > pos2b.z ? vec3(     0, pos2.y, pos2.z) :
               pos2b.y > pos2b.x && pos2b.y > pos2b.z ? vec3(pos2.x,      0, pos2.z) :
                                                        vec3(pos2.x, pos2.y,      0) ;

        vec3 edgeDist2 = max(pos2 - (BLOCK_R-blockTop-surfaceTravel), 0.0) / surfaceTravel;


        vec3 invRayOrig = (rotating && int(origPosAdj.x) == level) ? rotate(invRay0, -currAngle, axis) : invRay0;
        invRayOrig -= (origPos*spread);

        facingOut = -(sign(invRayOrig) * sign(origPos));
        facingOut = clamp(facingOut + 1.0, 0.0, 1.0) * 2.0 - 1.0; // change -1, 0, 1 to -1, 1, 1
        pos2b = abs(invRayOrig);
        int facing = pos2b.x > pos2b.y && pos2b.x > pos2b.z ? 0 : pos2b.y > pos2b.x && pos2b.y > pos2b.z ? 1 : 2;
        pos2 = pos2b * facingOut;
        pos2 = facing == 0 ? vec3(     0, pos2.y, pos2.z) :
               facing == 1 ? vec3(pos2.x,      0, pos2.z) :
                             vec3(pos2.x, pos2.y,      0) ;

        vec3 edgeDist2B = max(pos2 - (BLOCK_R-blockTop-surfaceTravel), 0.0) / surfaceTravel;
        edgeDist2 = length(edgeDist2) > length(edgeDist2B) ? edgeDist2 : edgeDist2B;

        vec3 light2 = edgeDist2.y > edgeDist2.x && edgeDist2.y > edgeDist2.z ? edgeDist2.yxz :
                      edgeDist2.z > edgeDist2.x && edgeDist2.z > edgeDist2.y ? edgeDist2.zyx : edgeDist2.xyz;
        light2 = light2.z > light2.y ? light2.xzy : light2.xyz;

        float ao2 = light2.y < shadowR ? max(light2.x, light2.y) : shadowR + length(light2.xy - shadowR);
        ao2 *= spaceTravel;

//        float ao3 = 0.0;
//        if (check==1&& rotating && facing != axis && abs(int(origPosAdj.x) - level) == 1) {
//            vec3 invRay0Adj =  adjustV(invRay0, axis);
//            ao3 = 1.0 - abs(float(level) - invRay0Adj.x);
//
//            vec3 testDir = adjustV(vec3(1,0,0), axis != 0 && facing != 0 ? 0 : axis != 1 && facing != 1 ? 1 : 2) * -sign(invRay0);
//            vec3 test0 = (-testDir * (outerBoxR * sign(invRay0) - invRay0)) + invRay0;
//
//            float testRes = rayBoxT(rotate(test0, -currAngle, axis), rotate(testDir, -currAngle, axis), vec3(outerBoxR)).x;
////            return vec4(t,testRes>0.0?vec3(0,testRes,0):vec3(-testRes,0,0));
//
//            vec3 edgeDist3 = max(abs(invRay0) - (outerBoxR-blockTop-(testRes>0.0?testRes*5.0: 0.0)-surfaceTravel), 0.0) / surfaceTravel;
//            ao3 *= length(edgeDist3);
//            float deg45 = 3.14159265359 * 0.25;
//            ao3 = clamp(ao3, 0.0, 1.0) * (1.0 - abs(mod(abs(currAngle), deg45*2.0) - deg45) / deg45);
//        }

        ao = clamp(length(vec2(ao1, ao2)), 0.0, 1.0);
        //        ao = clamp(length(vec3(ao1, ao2, ao3)), 0.0, 1.0);
    }
    return ao;
}



#pragma glslify: export(rotate)
#pragma glslify: export(blockIntersection)
