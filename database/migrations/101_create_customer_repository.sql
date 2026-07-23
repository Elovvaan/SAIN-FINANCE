CREATE TABLE customer_profiles (
    customer_id UUID PRIMARY KEY,
    institution_key TEXT NOT NULL,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('INDIVIDUAL', 'BUSINESS')),
    status TEXT NOT NULL DEFAULT 'PROSPECT' CHECK (status IN ('PROSPECT', 'ACTIVE', 'INACTIVE', 'DECLINED', 'ARCHIVED')),
    display_name TEXT NOT NULL,
    legal_name TEXT,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    business_name TEXT,
    email TEXT,
    phone TEXT,
    tax_id_last4 TEXT,
    date_of_birth DATE,
    formation_date DATE,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state_region TEXT,
    postal_code TEXT,
    country_code TEXT NOT NULL DEFAULT 'US',
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT REFERENCES users(user_id),
    updated_by TEXT REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_key, customer_id)
);

CREATE INDEX customer_profiles_institution_updated_idx
    ON customer_profiles (institution_key, updated_at DESC);

CREATE INDEX customer_profiles_search_idx
    ON customer_profiles USING GIN (
        to_tsvector('english',
            coalesce(display_name, '') || ' ' ||
            coalesce(legal_name, '') || ' ' ||
            coalesce(business_name, '') || ' ' ||
            coalesce(email, '') || ' ' ||
            coalesce(phone, '')
        )
    );

CREATE TABLE customer_events (
    event_id UUID PRIMARY KEY,
    institution_key TEXT NOT NULL,
    customer_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    actor_user_id TEXT REFERENCES users(user_id),
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (institution_key, customer_id)
        REFERENCES customer_profiles(institution_key, customer_id)
        ON DELETE CASCADE
);

CREATE INDEX customer_events_customer_created_idx
    ON customer_events (institution_key, customer_id, created_at DESC);
