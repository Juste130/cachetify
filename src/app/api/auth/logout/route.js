import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import authService from '../../../../server/services/auth';
import logger from '../../../../server/utils/logger';

export async function POST() {
    try {
        const refreshToken = (await cookies()).get('refreshToken')?.value;
        if (refreshToken) {
            await authService.revokeRefreshToken(refreshToken);
        }
    } catch (err) {
        logger.error('Error revoking refresh token on logout', err);
    }

    const response = NextResponse.json({ message: 'Logout successful' });
    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');
    return response;
}
