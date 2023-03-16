uniform mat4 u_ViewProjectionMatrix;
uniform mat4 u_RubikMatrix;
uniform mat4 u_ModelMatrix;
uniform mat3 u_FaceRotation;


in vec3 a_position;
out vec3 v_Position;
out vec3 v_PositionOrig;

in vec3 a_normal;
out vec3 v_Normal;
out vec3 v_NormalOrig;

out vec2 v_texcoord_0;
out vec2 v_texcoord_1;

in vec3 a_color_0;
out vec3 v_Color;



void main()
{
    gl_PointSize = 1.0f;
    vec4 pos = u_RubikMatrix * u_ModelMatrix * vec4(u_FaceRotation * a_position, 1.0);
    v_Position = pos.xyz;
    v_PositionOrig = a_position;

    v_Normal = normalize(vec3(u_RubikMatrix * u_ModelMatrix * vec4(u_FaceRotation * a_normal, 0.0)));
    v_NormalOrig = a_normal;

    v_texcoord_0 = vec2(0.0, 0.0);
    v_texcoord_1 = vec2(0.0, 0.0);

    v_Color = a_color_0;

    gl_Position = u_ViewProjectionMatrix * pos;
}
