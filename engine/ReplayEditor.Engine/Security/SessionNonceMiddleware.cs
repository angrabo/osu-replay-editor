using System.Security.Cryptography;
using System.Text;

namespace ReplayEditor.Engine.Security;

public static class SessionNonceMiddleware
{
    public static IApplicationBuilder UseSessionNonce(this IApplicationBuilder app, string nonce)
    {
        var expectedBytes = Encoding.UTF8.GetBytes(nonce);
        return app.Use(async (context, next) =>
        {
            var supplied = context.Request.Headers["X-Editor-Session"].ToString();
            var suppliedBytes = Encoding.UTF8.GetBytes(supplied);
            if (suppliedBytes.Length != expectedBytes.Length ||
                !CryptographicOperations.FixedTimeEquals(suppliedBytes, expectedBytes))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            await next(context);
        });
    }
}
