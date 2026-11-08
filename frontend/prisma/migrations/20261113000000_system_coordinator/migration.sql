-- Add the least-privilege care-coordination account role.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'coordinator';
