// Metallic Roughness
uniform float u_MetallicFactor;
uniform float u_RoughnessFactor;
uniform vec4 u_BaseColorFactor;

uniform vec3 u_Camera;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;


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
    vec2 UV = getNormalUV();
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

#ifdef HAS_NORMAL_MAP
    info.ntex = texture(u_NormalSampler, UV).rgb * 2.0 - vec3(1.0);
    info.ntex *= vec3(u_NormalScale, u_NormalScale, 1.0);
    info.ntex = normalize(info.ntex);
    info.n = normalize(mat3(t, b, ng) * info.ntex);
#else
    info.n = ng;
#endif

    info.t = t;
    info.b = b;
    return info;
}




vec4 getBaseColor()
{
    vec4 baseColor = vec4(1);

    baseColor = u_BaseColorFactor;

#if defined(MATERIAL_METALLICROUGHNESS) && defined(HAS_BASE_COLOR_MAP)
    baseColor *= texture(u_BaseColorSampler, getBaseColorUV());
#endif

    return sRGBToLinear(metallicColorScale(baseColor * getVertexColor(), u_MetallicFactor));
}



#ifdef MATERIAL_METALLICROUGHNESS
MaterialInfo getMetallicRoughnessInfo(MaterialInfo info)
{
    info.metallic = u_MetallicFactor;
    info.perceptualRoughness = u_RoughnessFactor;

#ifdef HAS_METALLIC_ROUGHNESS_MAP
    // Roughness is stored in the 'g' channel, metallic is stored in the 'b' channel.
    // This layout intentionally reserves the 'r' channel for (optional) occlusion map data
    vec4 mrSample = texture(u_MetallicRoughnessSampler, getMetallicRoughnessUV());
    info.perceptualRoughness *= mrSample.g;
    info.metallic *= mrSample.b;
#endif

    // Achromatic f0 based on IOR.
    info.c_diff = mix(info.baseColor.rgb,  vec3(0), info.metallic);
    info.f0 = mix(info.f0, info.baseColor.rgb, info.metallic);
    return info;
}
#endif
