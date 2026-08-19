import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@/lib/server/apiEngine';

export async function GET(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  return handleApiRequest(req, route.join('/'));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  return handleApiRequest(req, route.join('/'));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  return handleApiRequest(req, route.join('/'));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  return handleApiRequest(req, route.join('/'));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  return handleApiRequest(req, route.join('/'));
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-access-code, x-custom-api-key, x-device-fingerprint, x-use-cache, x-client-access-code, x-admin-code',
    },
  });
}
