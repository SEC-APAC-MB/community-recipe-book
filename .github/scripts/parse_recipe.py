#!/usr/bin/env python3
"""Parse recipe data from a GitHub Issue body."""
import json
import sys
import re
import os

def parse_issue_body(body):
    """Parse structured recipe data from issue body."""
    if not body:
        return None

    recipe = {}

    # Extract field values from the issue body
    # Format: ### Field Name\nvalue (or ### Field Name\n- item1\n- item2)
    field_pattern = r'###\s+(.+?)\n+((?:(?!###)[\s\S])*?)(?=\n###|\Z)'
    matches = re.findall(field_pattern, body)

    fields = {}
    for field_name, field_value in matches:
        fields[field_name.strip().lower()] = field_value.strip()

    # Map fields
    recipe['recipe_name'] = fields.get('recipe name', fields.get('recipe name *', '')).strip()
    recipe['display_name'] = fields.get('your name / name you\'d like displayed', fields.get('your name', fields.get('display name', ''))).strip()
    recipe['origin'] = fields.get('country or region of origin', fields.get('origin', '')).strip()
    recipe['story'] = fields.get('tell us the story behind your recipe', fields.get('story', '')).strip()
    recipe['serves'] = fields.get('serves *', fields.get('serves', '')).strip()
    recipe['prep_time'] = fields.get('prep time *', fields.get('prep time', '')).strip()
    recipe['cook_time'] = fields.get('cook time *', fields.get('cook time', '')).strip()
    recipe['difficulty'] = fields.get('difficulty', '').strip()
    recipe['ingredients'] = fields.get('ingredients *', fields.get('ingredients', '')).strip()
    recipe['method'] = fields.get('method / instructions *', fields.get('method', fields.get('instructions', ''))).strip()
    recipe['serve_with'] = fields.get('serve with', fields.get('what to serve with', '')).strip()
    recipe['email'] = fields.get('email *', fields.get('email', '')).strip()

    # Parse dietary tags (checkboxes)
    dietary_raw = fields.get('dietary', fields.get('dietary requirements', ''))
    dietary = []
    for line in dietary_raw.split('\n'):
        line = line.strip()
        if line.startswith('- [x]') or line.startswith('- [X]'):
            dietary.append(line[5:].strip())
    recipe['dietary'] = dietary

    # Parse allergens (checkboxes)
    allergens_raw = fields.get('allergens', fields.get('allergen information', ''))
    allergens = []
    for line in allergens_raw.split('\n'):
        line = line.strip()
        if line.startswith('- [x]') or line.startswith('- [X]'):
            allergens.append(line[5:].strip())
    recipe['allergens'] = allergens

    # Generate slug
    slug = recipe['recipe_name'].lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    import time
    recipe['slug'] = f"{slug}-{int(time.time())}"

    # Timestamp
    recipe['created_at'] = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
    recipe['photo'] = ''

    return recipe

def validate_recipe(recipe):
    """Check required fields."""
    required = ['recipe_name', 'serves', 'prep_time', 'cook_time', 'ingredients', 'method']
    for field in required:
        if not recipe.get(field):
            return False, f"Missing required field: {field}"
    return True, "OK"

if __name__ == '__main__':
    body = sys.argv[1] if len(sys.argv) > 1 else ''

    recipe = parse_issue_body(body)
    if not recipe:
        print("success=false")
        sys.exit(0)

    valid, msg = validate_recipe(recipe)
    if not valid:
        print(f"success=false")
        print(f"error={msg}")
        sys.exit(0)

    # Write parsed recipe to temp file for next step
    with open('/tmp/parsed_recipe.json', 'w') as f:
        json.dump(recipe, f, indent=2, ensure_ascii=False)

    # Output for GitHub Actions
    print(f"success=true")
    print(f"recipe_name={recipe['recipe_name']}")
    print(f"slug={recipe['slug']}")

    # Also set as GitHub Actions outputs
    with open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a') as f:
        f.write(f"success=true\n")
        f.write(f"recipe_name={recipe['recipe_name']}\n")
        f.write(f"slug={recipe['slug']}\n")