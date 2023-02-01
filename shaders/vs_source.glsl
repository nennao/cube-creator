attribute vec4 a_VertexPosition;
attribute vec3 a_VertexColor;

uniform mat4 u_RubikMatrix;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

varying vec3 v_Color;


void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix *  u_RubikMatrix * u_ModelMatrix * a_VertexPosition;

    v_Color = a_VertexColor;
}
