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
