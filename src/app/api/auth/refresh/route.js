import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import authService from '../../../../server/services/auth';
import { apiError, getClientIp } from '../../../../server/http';

const isProd = process.env.NODE_ENV === 'production';

function setAuthCookies(response, token, refreshToken) {
    const base = { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' };
    response.cookies.set('accessToken', token, { ...base, maxAge: 60 * 60 });
    response.cookies.set('refreshToken', refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 });
}

export async function POST(request) {
    try {
        const refreshToken = (await cookies()).get('refreshToken')?.value;
        if (!refreshToken) {
            return NextResponse.json({ error: 'Refresh token is required' }, { status: 401 });
        }

        const result = await authService.refreshAccessToken(refreshToken, {
            ip: getClientIp(request),
            ua: request.headers.get('user-agent'),
        });

        const response = NextResponse.json({ message: 'Token refreshed successfully' });
        setAuthCookies(response, result.token, result.refreshToken);
        return response;
    } catch (error) {
        return apiError(error);
    }
}
