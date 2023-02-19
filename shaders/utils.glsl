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


bool rayBlockIntersection(vec3 ray0, vec3 rayDir, vec3 blockPos, float blockR, float spread) {
    ray0 -= (blockPos * spread);

    float testR = BLOCK_R * (1.0 + ((sqrt(3.0)-1.0) * (1.0-blockR)));

    return (
        raySphere(ray0, rayDir, vec3(0), testR) &&
        (blockR > 0.99 ||
        rayBox(ray0, rayDir, vec3(-BLOCK_R), vec3(BLOCK_R)))
    );
}


bool raySliceIntersection(vec3 ray0, vec3 rayDir, vec3 blockMin, vec3 blockMax, float spread) {
    return rayBox(ray0, rayDir, (blockMin*spread)-BLOCK_R, (blockMax*spread)+BLOCK_R);
}


vec3 adjustV(vec3 v, int axis) {
    return axis == 1 ? v.yxz : axis == 2 ? v.zyx : v;
}


bool blockIntersection(
    mat3 invMat, vec3 fragPosition, vec3 rayDir, vec3 origPos, float blockR, float spread, float currAngle, int axis, int level
) {
    bool rotating = abs(currAngle) > 0.01;
    vec3 invRayDir = invMat * rayDir;
    vec3 invRay0 = invMat * fragPosition;

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
                vec3 blockPos =  adjustV(vec3(a, b, c), axis);
                if (distance(origPos, blockPos) < BLOCK_R) continue;
                if (rayBlockIntersection(iRay0, iRayDir, blockPos, blockR, spread)) {
                    return true;
                }
            }
        }
    }
    return false;
}



#pragma glslify: export(rotate)
#pragma glslify: export(blockIntersection)
