const float M_PI = 3.141592653589793;


in vec3 v_Position;
in vec3 v_PositionOrig;
in vec3 v_Normal;
in vec3 v_Color;

uniform int u_NonVColor;
uniform int u_ProcColor;


vec3 sortV3(vec3 v) {
    v = v.y > v.x && v.y > v.z ? v.yxz :
    v.z > v.x && v.z > v.y ? v.zyx : v.xyz;
    v = v.z > v.y ? v.xzy : v.xyz;
    return v;
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
    vec3 t;    // Geometry tangent
    vec3 b;    // Geometry bitangent
    vec3 n;    // Shading normal
    vec3 ntex; // Normal from texture, scaling is accounted for.
};


float clampedDot(vec3 x, vec3 y)
{
    return clamp(dot(x, y), 0.0, 1.0);
}


float max3(vec3 v)
{
    return max(max(v.x, v.y), v.z);
}


float sq(float t)
{
    return t * t;
}

vec2 sq(vec2 t)
{
    return t * t;
}

vec3 sq(vec3 t)
{
    return t * t;
}

vec4 sq(vec4 t)
{
    return t * t;
}

