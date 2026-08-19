import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@/lib/server/apiEngine';

export async function GET(req: NextRequest) {
  return handleApiRequest(req, '');
}

export async function POST(req: NextRequest) {
  return handleApiRequest(req, '');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}
