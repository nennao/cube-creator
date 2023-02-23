precision highp float;


#include <tonemapping.glsl>
#include <textures.glsl>
#include <functions.glsl>
#include <brdf.glsl>
#include <ibl.glsl>
#include <material_info.glsl>

out vec4 g_finalColor;


void main()
{
    vec4 baseColor = getBaseColor();

    baseColor.a = 1.0;

    vec3 v = normalize(u_Camera - v_Position);
    NormalInfo normalInfo = getNormalInfo(v);
    vec3 n = normalInfo.n;
    vec3 t = normalInfo.t;
    vec3 b = normalInfo.b;

    float NdotV = clampedDot(n, v);
    float TdotV = clampedDot(t, v);
    float BdotV = clampedDot(b, v);

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

    // Compute reflectance.
    float reflectance = max(max(materialInfo.f0.r, materialInfo.f0.g), materialInfo.f0.b);

    // Anything less than 2% is physically impossible and is instead considered to be shadowing. Compare to "Real-Time-Rendering" 4th editon on page 325.
    materialInfo.f90 = vec3(1.0);

    // LIGHTING
    vec3 f_specular = vec3(0.0);
    vec3 f_diffuse = vec3(0.0);
    vec3 f_emissive = vec3(0.0);
    //    vec3 f_clearcoat = vec3(0.0);
    //    vec3 f_sheen = vec3(0.0);
    //    vec3 f_transmission = vec3(0.0);

    //    float albedoSheenScaling = 1.0;


    // Calculate lighting contribution from image based lighting source (IBL)
    // USE_IBL
    f_specular += getIBLRadianceGGX(n, v, materialInfo.perceptualRoughness, materialInfo.f0, materialInfo.specularWeight);
    f_diffuse += getIBLRadianceLambertian(n, v, materialInfo.perceptualRoughness, materialInfo.c_diff, materialInfo.f0, materialInfo.specularWeight);


    float ao = 1.0;

    //    // Apply optional PBR terms for additional (optional) shading
    //    // HAS_OCCLUSION_MAP
    //    ao = texture(u_OcclusionSampler,  getOcclusionUV()).r;
    //    // apply ambient occlusion to all lighting that is not punctual
    //    f_diffuse = mix(f_diffuse, f_diffuse * ao, u_OcclusionStrength);
    //    f_specular = mix(f_specular, f_specular * ao, u_OcclusionStrength);


    vec3 color = f_emissive + f_diffuse + f_specular;

    #if DEBUG == DEBUG_NONE



    #ifdef LINEAR_OUTPUT
    g_finalColor = vec4(color.rgb, baseColor.a);
#else
    // todo remove u_Col
    g_finalColor = u_Col==1 || u_Col==4 ? vec4(linearTosRGB(materialInfo.baseColor), baseColor.a)
                 : u_Col==0 || u_Col==5 ? vec4(materialInfo.baseColor, baseColor.a)
                 :                        vec4(toneMap(color), baseColor.a);
#endif

#else
    // In case of missing data for a debug view, render a checkerboard.
    g_finalColor = vec4(1.0);
    {
        float frequency = 0.02;
        float gray = 0.9;

        vec2 v1 = step(0.5, fract(frequency * gl_FragCoord.xy));
        vec2 v2 = step(0.5, vec2(1.0) - fract(frequency * gl_FragCoord.xy));
        g_finalColor.rgb *= gray + v1.x * v1.y + v2.x * v2.y;
    }
#endif

    // Debug views:

    // Generic:
#if DEBUG == DEBUG_UV_0 && defined(HAS_TEXCOORD_0_VEC2)
    g_finalColor.rgb = vec3(v_texcoord_0, 0);
#endif
#if DEBUG == DEBUG_UV_1 && defined(HAS_TEXCOORD_1_VEC2)
    g_finalColor.rgb = vec3(v_texcoord_1, 0);
#endif
#if DEBUG == DEBUG_NORMAL_TEXTURE && defined(HAS_NORMAL_MAP)
    g_finalColor.rgb = (normalInfo.ntex + 1.0) / 2.0;
#endif
#if DEBUG == DEBUG_NORMAL_SHADING
    g_finalColor.rgb = (n + 1.0) / 2.0;
#endif
#if DEBUG == DEBUG_NORMAL_GEOMETRY
    g_finalColor.rgb = (normalInfo.ng + 1.0) / 2.0;
#endif
#if DEBUG == DEBUG_TANGENT
    g_finalColor.rgb = (normalInfo.t + 1.0) / 2.0;
#endif
#if DEBUG == DEBUG_BITANGENT
    g_finalColor.rgb = (normalInfo.b + 1.0) / 2.0;
#endif
#if DEBUG == DEBUG_ALPHA
    g_finalColor.rgb = vec3(baseColor.a);
#endif
#if DEBUG == DEBUG_OCCLUSION && defined(HAS_OCCLUSION_MAP)
    g_finalColor.rgb = vec3(ao);
#endif
#if DEBUG == DEBUG_EMISSIVE
    g_finalColor.rgb = linearTosRGB(f_emissive);
#endif

    // MR:
#ifdef MATERIAL_METALLICROUGHNESS
#if DEBUG == DEBUG_METALLIC_ROUGHNESS
    g_finalColor.rgb = linearTosRGB(f_diffuse + f_specular);
#endif
#if DEBUG == DEBUG_METALLIC
    g_finalColor.rgb = vec3(materialInfo.metallic);
#endif
#if DEBUG == DEBUG_ROUGHNESS
    g_finalColor.rgb = vec3(materialInfo.perceptualRoughness);
#endif
#if DEBUG == DEBUG_BASE_COLOR
    g_finalColor.rgb = linearTosRGB(materialInfo.baseColor);
#endif
#endif
}