#!/usr/bin/env python3
"""Add a parsed recipe to recipes.json."""
import json
import os

RECIPES_PATH = 'public/recipes.json'
PARSED_PATH = '/tmp/parsed_recipe.json'

def main():
    # Load existing recipes
    if os.path.exists(RECIPES_PATH):
        with open(RECIPES_PATH, 'r', encoding='utf-8') as f:
            recipes = json.load(f)
    else:
        recipes = []

    # Load the parsed recipe
    with open(PARSED_PATH, 'r', encoding='utf-8') as f:
        new_recipe = json.load(f)

    # Check for duplicate slug
    existing_slugs = {r['slug'] for r in recipes}
    if new_recipe['slug'] in existing_slugs:
        print(f"Recipe with slug {new_recipe['slug']} already exists, skipping")
        return

    # Add the new recipe
    recipes.append(new_recipe)

    # Sort by created_at descending (newest first)
    recipes.sort(key=lambda r: r.get('created_at', ''), reverse=False)

    # Write back
    with open(RECIPES_PATH, 'w', encoding='utf-8') as f:
        json.dump(recipes, f, indent=2, ensure_ascii=False)

    print(f"Added recipe: {new_recipe['recipe_name']} (slug: {new_recipe['slug']})")
    print(f"Total recipes: {len(recipes)}")

if __name__ == '__main__':
    main()