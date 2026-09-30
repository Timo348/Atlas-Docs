-- Administrators keep dashboard access through their role. Members start without
-- access and can only receive this separate grant through user administration.
ALTER TABLE "User" ADD COLUMN "metricsAccess" BOOLEAN NOT NULL DEFAULT false;
